from google import genai
import os
api=os.getenv('GOOGLE_API_KEY')
print('KEY',api)
client=genai.Client(api_key=api)
ms=client.list_models()
print('count',len(ms))
print([m['name'] for m in ms[:50]])
