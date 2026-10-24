# Image Generation with Text Prompts

> Complete guide to FLUX API endpoints for AI image generation. Learn text-to-image creation, API polling, regional endpoints, and code examples.

Our API endpoints enable media creation with BFL models. It follows an asynchronous design, where you first make a request for a generation and then query for the result of your request.

## API Endpoints

### Primary Global Endpoint

**`api.bfl.ai`** - Recommended for most use cases

* Routes requests across all available clusters globally
* Automatic failover between clusters for enhanced uptime
* Intelligent load distribution prevents bottlenecks during high traffic
* **Does not support finetuning and finetuned inference**
* **Important:** Always use the `polling_url` returned in responses when using this endpoint

### Regional Endpoints

**`api.eu.bfl.ai`** - European Multi-cluster

* Multi-cluster routing limited to EU regions
* GDPR compliant
* **Does not support finetuning and finetuned inference**

**`api.us.bfl.ai`** - US Multi-cluster

* Multi-cluster routing limited to US regions
* **Does not support finetuning and finetuned inference**

### Legacy Regional Endpoints

**`api.eu1.bfl.ai`** - EU Single-cluster

* Single cluster, no automatic failover
* Required for finetuning and finetuned inference operations in EU region

**`api.us1.bfl.ai`** - US Single-cluster

* Single cluster, no automatic failover
* Required for finetuning and finetuned inference operations in US region

<Note>
  For enhanced reliability and performance, we recommend using the global endpoint `api.bfl.ai` or regional endpoints `api.eu.bfl.ai`/`api.us.bfl.ai` for inference tasks.
</Note>

## Available Endpoints

We currently support the following endpoints for image generation:

1. `/flux-kontext-pro`
2. `/flux-kontext-max`
3. `/flux-pro-1.1-ultra`
4. `/flux-pro-1.1`
5. `/flux-pro`
6. `/flux-dev`

## Create Your First Image

### Submit Generation Request

To submit an image generation task with FLUX 1.1 \[pro\], create a request:

<CodeGroup>
  ```bash submit_request.sh
  # Install curl and jq, then run:
  # Make sure to set your API key: export BFL_API_KEY="your_key_here"

  request=$(curl -X 'POST' \
    'https://api.bfl.ai/v1/flux-kontext-pro' \
    -H 'accept: application/json' \
    -H "x-key: ${BFL_API_KEY}" \
    -H 'Content-Type: application/json' \
    -d '{
    "prompt": "A cat on its back legs running like a human is holding a big silver fish with its arms. The cat is running away from the shop owner and has a panicked look on his face. The scene is situated in a crowded market.",
    "aspect_ratio": "1:1",
  }')

  echo $request
  request_id=$(jq -r .id <<< $request)
  polling_url=$(jq -r .polling_url <<< $request)
  echo "Request ID: ${request_id}"
  echo "Polling URL: ${polling_url}"
  ```

  ```python submit_request.py
  # Install requests: pip install requests

  import os
  import requests

  request = requests.post(
      'https://api.bfl.ai/v1/flux-kontext-pro',
      headers={
          'accept': 'application/json',
          'x-key': os.environ.get("BFL_API_KEY"),
          'Content-Type': 'application/json',
      },
      json={
          'prompt': 'A cat on its back legs running like a human is holding a big silver fish with its arms. The cat is running away from the shop owner and has a panicked look on his face. The scene is situated in a crowded market.',
          "aspect_ratio": "1:1"
      },
  ).json()

  print(request)
  request_id = request["id"]
  polling_url = request["polling_url"]
  print(f"Request ID: {request_id}")
  print(f"Polling URL: {polling_url}")
  ```
</CodeGroup>

A successful response will be a json object containing the request's id and a `polling_url` that should be used to retrieve the result.

<Warning>
  **Important:** When using the global endpoint (`api.bfl.ai`) or regional endpoints (`api.eu.bfl.ai`, `api.us.bfl.ai`), you must use the `polling_url` returned in the response for checking request status.
</Warning>

### Poll for Results

To retrieve the result, poll the endpoint using the `polling_url`:

<CodeGroup>
  ```bash poll_results.sh
  # This assumes that the request_id and polling_url variables are set from the previous step

  while true
  do
    sleep 0.5
    result=$(curl -s -X 'GET' \
      "${polling_url}" \
      -H 'accept: application/json' \
      -H "x-key: ${BFL_API_KEY}")
    
    status=$(jq -r .status <<< $result)
    echo "Status: $status"
    
    if [ "$status" == "Ready" ]
    then
      echo "Result: $(jq -r .result.sample <<< $result)"
      break
    elif [ "$status" == "Error" ] || [ "$status" == "Failed" ]
    then
      echo "Generation failed: $result"
      break
    fi
  done
  ```

  ```python poll_results.py
  # This assumes request_id and polling_url are set from the previous step
  import time

  while True:
      time.sleep(0.5)
      result = requests.get(
          polling_url,
          headers={
              'accept': 'application/json',
              'x-key': os.environ.get("BFL_API_KEY"),
          },
          params={
              'id': request_id,
          },
      ).json()
      
      status = result["status"]
      print(f"Status: {status}")
      
      if status == "Ready":
          print(f"Result: {result['result']['sample']}")
          break
      elif status in ["Error", "Failed"]:
          print(f"Generation failed: {result}")
          break
  ```
</CodeGroup>

A successful response will be a JSON object containing the result, where `result['sample']` is a signed URL for retrieval.

<Warning>
  Our signed URLs are only valid for 10 minutes. Please retrieve your result within this timeframe.
</Warning>

<Warning>
  **Image Delivery:** The `result.sample` URLs are served from delivery endpoints (`delivery-eu1.bfl.ai`, `delivery-us1.bfl.ai`) and are not meant to be served directly to users. We recommend downloading the image and re-serving it from your own infrastructure. We do not enable CORS on delivery URLs.
</Warning>

See our [reference documentation](https://docs.bfl.ai/api-reference/) for a full list of options and our [inference repo](https://github.com/black-forest-labs/flux).

## Limits

<Warning>
  **Rate Limits:** Sending requests to our API is limited to 24 active tasks. If you exceed your limit, you'll receive a status code `429` and must wait until one of your previous tasks has finished.
</Warning>

<Warning>
  **Rate Limits:** Additionally, due to capacity issues, for `flux-kontext-max`, the requests to our API is limited to 6 active tasks.
</Warning>

<Note>
  **Credits:** If you run out of credits (status code `402`), visit [https://api.bfl.ai](https://api.bfl.ai), sign in and click "Add" to buy additional credits. See also [managing your account](https://docs.bfl.ai/quick_start/managing_account).
</Note>

<Tip>
  If you require higher volumes, please contact us at [flux@blackforestlabs.ai](mailto:flux@blackforestlabs.ai)
</Tip>



# Image Generation

FLUX.1 Kontext \[pro\] can generate images directly from text input, allowing you to create entirely new visuals. This guide focuses on using the `/flux-kontext-pro` endpoint for its Text-to-Image capabilities.

To generate an image from text, you'll make a request to the `/flux-kontext-pro` endpoint.

## Examples of Image Generation

FLUX.1 Kontext \[pro\] not only can edit images, but it can also generate images with a prompt. Here are a few examples of what you can create:

<Columns cols={4}>
  <Frame>
    <img src="https://cdn.sanity.io/images/gsvmb6gz/production/a25299ba8dd5d386cfbf9cf9f3a3f2c519fd3b92-1024x1024.jpg" />
  </Frame>

  <Frame>
    <img src="https://cdn.sanity.io/images/gsvmb6gz/production/f4879d430a114e9a28f62e42192365976bd9d545-1024x1024.jpg" />
  </Frame>

  <Frame>
    <img src="https://cdn.sanity.io/images/gsvmb6gz/production/4fc50f2d7b8abbdbdb5bdcf979309e3e6df1d31e-1024x1024.jpg" />
  </Frame>

  <Frame>
    <img src="https://cdn.sanity.io/images/gsvmb6gz/production/cf8197b308cbd564f5fd43eedf52fce612b49806-1024x1024.jpg" />
  </Frame>
</Columns>

**Prompts for the images above:**

• **Abstract cat artwork:** "Abstract expressionist painting Pop Art and cubism early 20 century, straight lines and solids, cute cat face without body, warm colors, green, intricate details, hologram floating in space, a vibrant digital illustration, black background, flat color, 2D, strong lines."

• **Robot and truck:** "A cute round rusted robot repairing a classic pickup truck, colorful, futuristic, vibrant glow, van gogh style"

• **Furry elephant:** "A small furry elephant pet looks out from a cat house"

• **Face paint portrait:** "A close-up of a face adorned with intricate black and blue patterns. The left side of the face is predominantly yellow, with symbols and doodles, while the right side is dark, featuring mechanical elements. The eye on the left is a striking shade of yellow, contrasting sharply with the surrounding patterns. The face is partially covered by a hooded garment, realistic style"

<Columns cols={4}>
  <Frame>
    <img src="https://cdn.sanity.io/images/gsvmb6gz/production/3bce31811d0a95960f2a30ca8c548af9463b78c8-1024x1024.jpg" />
  </Frame>

  <Frame>
    <img src="https://cdn.sanity.io/images/gsvmb6gz/production/fe5135de7fa5a666ddb38f234dd55fe285435719-1024x1024.jpg" />
  </Frame>

  <Frame>
    <img src="https://cdn.sanity.io/images/gsvmb6gz/production/930a9437a1b85af8721e9107daefa76e40b82365-1024x1024.jpg" />
  </Frame>

  <Frame>
    <img src="https://cdn.sanity.io/images/gsvmb6gz/production/821bc59e839e362bc02a10a6662dc52e4da71da5-1024x1024.jpg" />
  </Frame>
</Columns>

**Prompts for the images above:**

• **Rainy car scene:** "Close-up of a vintage car hood under heavy rain, droplets cascading down the deep cherry-red paint, windshield blurred with streaks of water, glowing headlights diffused through mist, reflections of crimson neon signage spelling "FLUX" dancing across the wet chrome grille, steam rising from the engine, ambient red light enveloping the scene, moody composition, shallow depth of field, monochromatic red palette, cinematic lighting with glossy textures."

• **Burning temple warrior:** "A lone warrior, clad in bloodstained samurai armor, stands motionless before a massive pagoda engulfed in flames. Embers and ash swirl around him like ghosts of fallen enemies. The once-sacred temple is collapsing, its ornate carvings crumbling into the blaze as distant screams echo through the smoke-filled air. A tattered banner flutters beside him, the last symbol of a forgotten oath. The scene is both devastating and mesmerizing, with deep reds, burning oranges, and cold blue shadows creating a stark contrast. Cinematic composition, ultra-detailed textures, dynamic lighting, atmospheric fog, embers in the wind, dark fantasy realism, intense contrast."

• **Foggy gas station:** "Remote gas station swallowed by crimson fog, green glow from overhead lights staining the asphalt, new tiny smart car idling with taillights cutting through the mist, vending machine humming beside cracked fuel pumps, oily puddles reflecting distorted neon, shadows stretching unnaturally long, skeletal trees barely visible in the background, wide-angle cinematic shot, deep green monochromatic palette with faint charcoal accents, backlighting and heavy atmosphere, surreal and ominous mood."

• **Detective game character:** "Retro game style, man in old school suit, upper body, true detective, detailed character, nigh sky, crimson moon silhouette, american muscle car parked on dark street in background, complex background in style of Bill Sienkiewicz and Dave McKean and Carne Griffiths, extremely detailed, mysterious, grim, provocative, thrilling, dynamic, action-packed, fallout style, vintage, game theme, masterpiece, high contrast, stark. vivid colors, 16-bit, pixelated, textured, distressed"

## Using FLUX.1 Kontext API for Text-to-Image Generation

### Create a Request

<CodeGroup>
  ```bash create_request.sh
  # Install `curl` and `jq`, then run:
  # Ensure BFL_API_KEY is set
  # export BFL_API_KEY="your_api_key_here"

  request=$(curl -X POST \
    'https://api.bfl.ai/v1/flux-kontext-pro' \
    -H 'accept: application/json' \
    -H "x-key: ${BFL_API_KEY}" \
    -H 'Content-Type: application/json' \
    -d '{
      "prompt": "A small furry elephant pet looks out from a cat house",
      "aspect_ratio": "1:1"
  }')

  request_id=$(echo $request | jq -r .id)
  polling_url=$(echo $request | jq -r .polling_url)
  ```

  ```python create_request.py
  # Install `requests` (e.g. `pip install requests`) 
  # and `Pillow` (e.g. `pip install Pillow`)

  import os
  import requests
  import time

  request = requests.post(
      'https://api.bfl.ai/v1/flux-kontext-pro',
      headers={
          'accept': 'application/json',
          'x-key': os.environ.get("BFL_API_KEY"),
          'Content-Type': 'application/json',
      },
      json={
          'prompt': 'A small furry elephant pet looks out from a cat house',
      },
  ).json()

  print(request)
  request_id = request["id"]
  polling_url = request["polling_url"] # Use this URL for polling
  ```
</CodeGroup>

A successful response will be a JSON object containing the request's `id`. This ID is used to retrieve the generated image.

### Poll for Result

After submitting a request, you need to poll using the returned `polling_url` to  retrieve the output when ready.

<CodeGroup>
  ```bash poll_result.sh
  while true; do
    sleep 0.5
    result=$(curl -s -X 'GET' \
      "${polling_url}" \
      -H 'accept: application/json' \
      -H "x-key: ${BFL_API_KEY}")
    
    status=$(echo $result | jq -r .status)
    echo "Status: $status"
    
    if [ "$status" == "Ready" ]; then
      echo "Result: $(echo $result | jq -r .result.sample)"
      break
    elif [ "$status" == "Error" ] || [ "$status" == "Failed" ]; then
      echo "Generation failed: $result"
      break
    fi
  done
  ```

  ```python poll_result.py
  # This assumes the `polling_url` variable is set.
  import time
  import os
  import requests

  while True:
    time.sleep(0.5)
    result = requests.get(
        polling_url,
        headers={
            'accept': 'application/json',
            'x-key': os.environ.get("BFL_API_KEY"),
        },
        params={'id': request_id}
    ).json()
    
    if result['status'] == 'Ready':
        print(f"Image ready: {result['result']['sample']}")
        break
    elif result['status'] in ['Error', 'Failed']:
        print(f"Generation failed: {result}")
        break
  ```
</CodeGroup>

A successful response will be a json object containing the result, and `result['sample']` is a signed URL for retrieval.

<Warning>
  Our signed URLs are only valid for 10 minutes. Please retrieve your result within this timeframe.
</Warning>

### FLUX.1 Kontext Text-to-Image Parameters

<Tip>
  FLUX.1 Kontext creates 1024x1024 images by default. Use `aspect_ratio` to adjust the dimensions while keeping the same total pixels.
</Tip>

* **Supported Range**: Aspect ratios can range from 3:7 (portrait) to 7:3 (landscape).
* **Default Behavior**: If `aspect_ratio` is not specified, the model will default to a standard aspect ratio like 1:1 (e.g. 1024x1024).

| Parameter           | Type           | Default  | Description                                                                                        | Required |
| ------------------- | -------------- | -------- | -------------------------------------------------------------------------------------------------- | -------- |
| `prompt`            | string         |          | Text description of the desired image.                                                             | **Yes**  |
| `aspect_ratio`      | string / null  | "1:1"  | Desired aspect ratio (e.g., "16:9"). All outputs are \~1MP total. Supports ratios from 3:7 to 7:3. | No       |
| `seed`              | integer / null | `null`   | Seed for reproducibility. If `null` or omitted, a random seed is used. Accepts any integer.        | No       |
| `prompt_upsampling` | boolean        | `false`  | If true, performs upsampling on the prompt                                                         | No       |
| `safety_tolerance`  | integer        | `2`      | Moderation level for inputs and outputs. Value ranges from 0 (most strict) to 6 (more permissive). | No       |
| `output_format`     | string         | "jpeg" | Desired format of the output image. Can be "jpeg" or "png".                                    | No       |
| `webhook_url`       | string / null  | `null`   | URL for asynchronous completion notification. Must be a valid HTTP/HTTPS URL.                      | No       |
| `webhook_secret`    | string / null  | `null`   | Secret for webhook signature verification, sent in the `X-Webhook-Secret` header.                  | No       |
