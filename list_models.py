
from anthropic import Anthropic
import os

client = Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
for m in client.models.list().model_data:
    print(m['id'])

