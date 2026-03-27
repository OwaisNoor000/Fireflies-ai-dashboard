import requests
from dotenv import load_dotenv
import os

load_dotenv()

url = 'https://api.fireflies.ai/graphql'
headers = {
    'Content-Type': 'application/json',
    'Authorization': f'Bearer {os.environ["FIREFLIES_KEY"]}'
}
print(os.environ["FIREFLIES_KEY"])

transcription_id = "01KMMY2Y01XZQ6F4Z14PRWJYC9"

# data = f'{{"query": "query Transcript($transcriptId: String!) {{ transcript(id: $transcriptId) {{ title summary {{ short_summary overview action_items outline keywords bullet_gist gist topics_discussed }} }} }}", "variables": {{"transcriptId": "{transcription_id}"}}}}'
data = {
    "query": """
    query Transcript($transcriptId: String!) {
      transcript(id: $transcriptId) {
        title
        summary {
          short_summary
          overview
          action_items
          outline
          keywords
          bullet_gist
          gist
          topics_discussed
        }
      }
    }
    """,
    "variables": {
        "transcriptId": transcription_id
    }
}
response = requests.post(url, json=data, headers=headers)
print(response.json())