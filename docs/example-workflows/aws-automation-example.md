# Example workflow: Detecting events in AWS and importing to Snyk

## Detecting new ECR images and/or Lambda functions in AWS and importing/testing them with Snyk

Using AWS's services, specifically [EventBridge](https://console.aws.amazon.com/events/), you can now detect almost any processes from other services, including ECR and Lambda, and trigger a Lambda function to be invoked upon that detection.
Here are some highlights on how to configure this (through the UI and taken from [this guide](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-run-lambda-schedule.html)):

1. Create a [Lambda function](https://console.aws.amazon.com/lambda/) that will receive data from EventBridge (you can create an empty fuction and work on it later), the data varies according to the event, for example: a push image to ECR event will have thise format and data (taken from [this guide](https://docs.aws.amazon.com/AmazonECR/latest/userguide/ecr-eventbridge.html#:~:text=The%20following%20event%20is%20sent%20when%20each%20image%20push%20is%20completed.%20For%20more%20information%2C%20see%20Pushing%20a%20Docker%20image.)):

```
{
  "account": "123456789012",
  "detail": {
    "action-type": "PUSH",
    "image-digest": "sha256:f98d67af8e53a536502bfc600de3266556b06ed635a32d60aa7a5fe6d7e609d7",
    "image-tag": "latest",
    "repository-name": "ubuntu",
    "result": "SUCCESS"
  },
  "detail-type": "ECR Image Action",
  "id": "4f5ec4d5-4de4-7aad-a046-56d5cfe1df0e",
  "region": "us-east-1",
  "resources": [],
  "source": "aws.ecr",
  "time": "2019-08-06T00:58:09Z",
  "version": "0"
}
```

2. Go to your [Events page in AWS](https://console.aws.amazon.com/events/)
3. Create a rule, for example: detecting a successfully pushed image to ECR

- The event pattern will look somthing like this:

```
{
  "source": ["aws.ecr"],
  "detail-type": ["ECR Image Action"],
  "detail": {
    "action-type": ["PUSH"],
    "result": ["SUCCESS"]
  }
}
```

## The Lambda function

Your Lambda function will need to do the following in general:

1. Parse the new image's repository name and image tag from the data coming from the Event
2. Use that info to trigger am import job with the snyk-api-import tool

To kick off an import, your Lambda function will need your `SNYK_TOKEN`, `SNYK_ORG_ID` and `ORG_INTEGRATION_ID` (or access to SSM with those parameters)

### Suggested architecture for the Lambda function

1. Get the "repository-name" and the "image-tag" from the event
2. Install or download the latest [snyk-api-import tool](https://github.com/snyk/snyk-api-import/releases)
3. Create a targets file for the tool using your SNYK_ORG_ID, ORG_INTEGRATION_ID as explained [here](https://github.com/snyk/snyk-api-import/blob/master/docs/import.md#1-create-the-import-projectsjson-file). The import file shsould have the neccessary fileds as needed by our [import endpoint](https://snyk.docs.apiary.io/#reference/import-projects/import-targets), for example - an import file for a new image will look something like this:

```
{
   "targets":[
        {
         "integrationId":">ORG_INTEGRATION_ID>",
         "orgId":"<SNYK_ORG_ID>",
         "target":{
            "name": "<REPOSITORY_NAME>:<IMAGE_TAG>"
            }
        }
   ]
}
```

4. Set your `SNYK_TOKEN` and your `SNYK_LOG_PATH` as an enviroment variables
5. Kick off an import by running the import command with refernce to the created import file, for example:

```
DEBUG=snyk* snyk-api-import import --file=path/to/import-targets.json
```

6. Wait for the imported targets log file - "imported-targets.log" to be created
7. Check that the log indicates a successful import
8. Done!
