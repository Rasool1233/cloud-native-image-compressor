import json
import boto3
import os
import urllib.parse
import uuid

s3_client = boto3.client('s3')

def lambda_handler(event, context):
    print('API Handler invoked - Raw event:', json.dumps(event))
    
    try:
        # Parse the request
        http_method = event.get('httpMethod', 'GET')
        body = {}
        
        # Parse body if present
        if 'body' in event and event['body']:
            try:
                body = json.loads(event['body'])
            except:
                body = {}
        
        # Handle different endpoints
        if http_method == 'OPTIONS':
            # CORS preflight response
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
                },
                'body': ''
            }
        
        elif http_method == 'POST':
            action = body.get('action', '')
            
            if action == 'test':
                return {
                    'statusCode': 200,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'message': 'API is working!',
                        'timestamp': context.aws_request_id,
                        'endpoint': 'test'
                    })
                }
            
            elif action == 'getPresignedUploadUrl':
                return generate_presigned_url_response(body)
            
            else:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'error': 'Invalid action',
                        'validActions': ['test', 'getPresignedUploadUrl']
                    })
                }
        
        elif http_method == 'GET':
            # Handle GET request for download URLs
            query_params = event.get('queryStringParameters', {}) or {}
            key = query_params.get('key', '')
            
            if not key:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'error': 'Key parameter required for downloads',
                        'example': '/upload?key=processed/job_id/1080p/image.jpg'
                    })
                }
            
            # Generate download URL
            output_bucket = os.environ.get('OUTPUT_BUCKET', 'output-bucket-image-compressor')
            presigned_url = s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': output_bucket, 'Key': key},
                ExpiresIn=3600
            )
            
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({
                    'url': presigned_url,
                    'key': key,
                    'expiresIn': 3600,
                    'message': 'Download URL generated'
                })
            }
        
        else:
            return {
                'statusCode': 405,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Method not allowed'})
            }
            
    except Exception as e:
        print('Error in Lambda handler:', str(e))
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': str(e), 'message': 'Internal server error'})
        }

def generate_presigned_url_response(body):
    """Generate presigned URL for S3 upload"""
    try:
        file_name = body.get('fileName', 'upload.jpg')
        file_type = body.get('fileType', 'image/jpeg')
        
        # Generate unique filename
        unique_id = str(uuid.uuid4())[:8]
        base_name, ext = os.path.splitext(file_name)
        safe_file_name = f"{base_name}_{unique_id}{ext}"
        
        # Get bucket from environment
        input_bucket = os.environ.get('INPUT_BUCKET', 'input-bucket-image-compressor')
        
        print(f'Generating presigned URL for {file_name}')
        
        # Generate presigned POST data
        presigned_post = s3_client.generate_presigned_post(
            Bucket=input_bucket,
            Key=f"uploads/{safe_file_name}",
            Fields={"Content-Type": file_type},
            Conditions=[
                ["starts-with", "$Content-Type", "image/"],
                ["content-length-range", 0, 10485760]  # 10MB
            ],
            ExpiresIn=3600
        )
        
        response_data = {
            'uploadUrl': presigned_post['url'],
            'fields': presigned_post['fields'],
            'fileUrl': f"uploads/{safe_file_name}",
            'fileName': safe_file_name,
            'message': 'Presigned URL generated successfully',
            'expiresIn': 3600
        }
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(response_data)
        }
        
    except Exception as e:
        print('Error generating presigned URL:', str(e))
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': str(e), 'message': 'Failed to generate upload URL'})
        }
