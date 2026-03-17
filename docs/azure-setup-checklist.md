# Azure Setup Values

## Resource Group
- RESOURCE_GROUP=wesonlinephnak
- LOCATION=australiaeast

## Storage
- STORAGE_ACCOUNT_NAME=stwesonlinephnak
- INPUT_CONTAINER=input
- OUTPUT_CONTAINER=output

## Azure Maps
- AZURE_MAPS_ACCOUNT_NAME=mapswesonlinephnak
- AZURE_MAPS_SKU=G2
- AZURE_MAPS_KIND=Gen2
- AZURE_MAPS_KEY=

## Azure OpenAI
- AZURE_OPENAI_NAME=openai-wesonlinephnak
- AZURE_OPENAI_ENDPOINT=https://openai-wesonlinephnak.openai.azure.com
- AZURE_OPENAI_DEPLOYMENT=gpt-4o
- AZURE_OPENAI_SKU=GlobalStandard
- AZURE_OPENAI_API_KEY=

## Logic App (Consumption)
- LOGIC_APP_NAME=la-wesonlinephnak
- LOGIC_APP_TYPE=Microsoft.Logic/workflows
- ARM_TEMPLATE=logicapps/consumption/arm-template.json

## Function App
- FUNCTION_APP_NAME=func-wesonlinephnak
- FUNCTION_RUNTIME=node
- FUNCTION_RUNTIME_VERSION=20
- FUNCTION_OS=Linux

## Static Web App
- STATIC_WEB_APP_NAME=swa-wesonlinephnak
- STATIC_WEB_APP_HOSTNAME=mango-glacier-01bf2d500.1.azurestaticapps.net