import json
import boto3
import os
from PIL import Image
import io
import uuid
from urllib.parse import unquote_plus

s3_client = boto3.client('s3')

def lambda_handler(event, context):
    # Get the bucket and key from the S3 event
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = unquote_plus(event['Records'][0]['s3']['object']['key'])
    
    print(f"Processing image: {bucket}/{key}")
    
    # Generate unique ID for this processing job
    job_id = str(uuid.uuid4())
    
    try:
        # Download image from S3
        response = s3_client.get_object(Bucket=bucket, Key=key)
        content_type = response['ContentType']
        image_data = response['Body'].read()
        
        # Open image with Pillow
        image = Image.open(io.BytesIO(image_data))
        
        # Get original dimensions
        original_width, original_height = image.size
        
        # Define output sizes
        output_sizes = {
            '1080p': (1920, 1080),
            '720p': (1280, 720),
            '480p': (854, 480)
        }
        
        # Process and upload each size
        processed_urls = {}
        
        for size_name, dimensions in output_sizes.items():
            # Resize image
            resized_image = image.copy()
            resized_image.thumbnail(dimensions, Image.Resampling.LANCZOS)
            
            # Convert to RGB if necessary (for JPEG)
            if resized_image.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', resized_image.size, (255, 255, 255))
                background.paste(resized_image, mask=resized_image.split()[-1] if resized_image.mode == 'RGBA' else None)
                resized_image = background
            
            # Save to bytes
            output_buffer = io.BytesIO()
            resized_image.save(output_buffer, format='JPEG', quality=85, optimize=True)
            output_buffer.seek(0)
            
            # Create output key
            output_key = f"processed/{job_id}/{size_name}/{os.path.basename(key)}"
            
            # Upload to output bucket
            output_bucket = os.environ['OUTPUT_BUCKET']
            s3_client.put_object(
                Bucket=output_bucket,
                Key=output_key,
                Body=output_buffer,
                ContentType='image/jpeg'
            )
            
            # Generate presigned URL (valid for 1 hour)
            presigned_url = s3_client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': output_bucket,
                    'Key': output_key
                },
                ExpiresIn=3600
            )
            
            processed_urls[size_name] = {
                'url': presigned_url,
                'dimensions': dimensions,
                'size': len(output_buffer.getvalue())
            }
            
            print(f"Created {size_name}: {output_key}")
        
        # Return results
        return {
            'statusCode': 200,
            'body': json.dumps({
                'jobId': job_id,
                'originalImage': key,
                'processedImages': processed_urls,
                'message': 'Image processing completed successfully'
            })
        }
        
    except Exception as e:
        print(f"Error processing image: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e),
                'message': 'Image processing failed'
            })
        }
