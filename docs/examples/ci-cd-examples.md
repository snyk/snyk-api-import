# CI/CD Examples

Complete examples for automating snyk-api-import in various CI/CD platforms.

## Table of Contents

- [GitHub Actions](#github-actions)
- [GitLab CI](#gitlab-ci)
- [Jenkins](#jenkins)
- [Kubernetes CronJob](#kubernetes-cronjob)
- [AWS Lambda](#aws-lambda)
- [Azure Pipelines](#azure-pipelines)

## GitHub Actions

### Weekly Full Import

```yaml
name: Snyk Import - Weekly
on:
  schedule:
    # Run every Sunday at 2 AM UTC
    - cron: '0 2 * * 0'
  workflow_dispatch:  # Allow manual trigger

jobs:
  import:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Download snyk-api-import
        run: |
          curl -Lo snyk-api-import \
            https://github.com/snyk/snyk-api-import/releases/latest/download/snyk-api-import-linux-amd64
          chmod +x snyk-api-import
          sudo mv snyk-api-import /usr/local/bin/

      - name: Setup log directory
        run: mkdir -p logs

      - name: List previously imported targets
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
          SNYK_LOG_PATH: ./logs
        run: |
          snyk-api-import list:imported \
            --source=github \
            --groupId=${{ vars.SNYK_GROUP_ID }} \
            --orgsFile=logs/snyk-created-orgs.json || true

      - name: Generate org data
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
          SNYK_LOG_PATH: ./logs
        run: |
          snyk-api-import orgs:data \
            --source=github \
            --groupId=${{ vars.SNYK_GROUP_ID }} \
            --skipEmptyOrgs

      - name: Create orgs in Snyk
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
          SNYK_LOG_PATH: ./logs
        run: |
          snyk-api-import orgs:create \
            --file=logs/group-${{ vars.SNYK_GROUP_ID }}-github-orgs.json

      - name: Generate import targets
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
          SNYK_LOG_PATH: ./logs
        run: |
          snyk-api-import import:data \
            --source=github \
            --orgsData=logs/snyk-created-orgs.json

      - name: Run import
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
          SNYK_LOG_PATH: ./logs
        run: |
          snyk-api-import import

      - name: Upload logs
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: import-logs-${{ github.run_number }}
          path: logs/
          retention-days: 30

      - name: Check for failures
        run: |
          if [ -f logs/*.failed-projects.log ]; then
            echo "❌ Some projects failed to import"
            jq -r '.error' logs/*.failed-projects.log | sort | uniq -c
            exit 1
          fi
```

### Daily Sync

```yaml
name: Snyk Sync - Daily
on:
  schedule:
    # Run every day at 3 AM UTC
    - cron: '0 3 * * *'
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        org_id:
          - org-abc-123
          - org-def-456
          - org-ghi-789
      fail-fast: false
    steps:
      - name: Download snyk-api-import
        run: |
          curl -Lo snyk-api-import \
            https://github.com/snyk/snyk-api-import/releases/latest/download/snyk-api-import-linux-amd64
          chmod +x snyk-api-import
          sudo mv snyk-api-import /usr/local/bin/

      - name: Setup log directory
        run: mkdir -p logs

      - name: Sync org ${{ matrix.org_id }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
          SNYK_LOG_PATH: ./logs
        run: |
          snyk-api-import sync \
            --source=github \
            --orgPublicId=${{ matrix.org_id }}

      - name: Upload logs
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: sync-logs-${{ matrix.org_id }}-${{ github.run_number }}
          path: logs/
          retention-days: 7
```

### GitHub Cloud App Authentication

```yaml
name: Snyk Import - GitHub App
on:
  schedule:
    - cron: '0 2 * * 0'
  workflow_dispatch:

jobs:
  import:
    runs-on: ubuntu-latest
    steps:
      - name: Download snyk-api-import
        run: |
          curl -Lo snyk-api-import \
            https://github.com/snyk/snyk-api-import/releases/latest/download/snyk-api-import-linux-amd64
          chmod +x snyk-api-import
          sudo mv snyk-api-import /usr/local/bin/

      - name: Setup log directory
        run: mkdir -p logs

      - name: Generate org data
        env:
          GITHUB_APP_ID: ${{ vars.GITHUB_APP_ID }}
          GITHUB_APP_PRIVATE_KEY: ${{ secrets.GITHUB_APP_PRIVATE_KEY }}
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
          SNYK_LOG_PATH: ./logs
        run: |
          snyk-api-import orgs:data \
            --source=github-cloud-app \
            --groupId=${{ vars.SNYK_GROUP_ID }}

      - name: Create orgs
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
          SNYK_LOG_PATH: ./logs
        run: |
          snyk-api-import orgs:create \
            --file=logs/group-${{ vars.SNYK_GROUP_ID }}-github-cloud-app-orgs.json

      - name: Generate import targets
        env:
          GITHUB_APP_ID: ${{ vars.GITHUB_APP_ID }}
          GITHUB_APP_PRIVATE_KEY: ${{ secrets.GITHUB_APP_PRIVATE_KEY }}
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
          SNYK_LOG_PATH: ./logs
        run: |
          snyk-api-import import:data \
            --source=github-cloud-app \
            --orgsData=logs/snyk-created-orgs.json

      - name: Run import
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
          SNYK_LOG_PATH: ./logs
        run: snyk-api-import import

      - name: Upload logs
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: import-logs-${{ github.run_number }}
          path: logs/
          retention-days: 30
```

---

## GitLab CI

### Weekly Import Pipeline

```yaml
# .gitlab-ci.yml
snyk-import:
  image: alpine:latest
  stage: import
  only:
    # Run weekly on Sunday at 2 AM
    - schedules
  before_script:
    - apk add --no-cache curl jq
    - curl -Lo /usr/local/bin/snyk-api-import \
        https://github.com/snyk/snyk-api-import/releases/latest/download/snyk-api-import-linux-amd64
    - chmod +x /usr/local/bin/snyk-api-import
    - mkdir -p logs
  script:
    - |
      snyk-api-import orgs:data \
        --source=gitlab \
        --groupId=${SNYK_GROUP_ID} \
        --skipEmptyOrgs
    - |
      snyk-api-import orgs:create \
        --file=logs/group-${SNYK_GROUP_ID}-gitlab-orgs.json
    - |
      snyk-api-import import:data \
        --source=gitlab \
        --orgsData=logs/snyk-created-orgs.json
    - snyk-api-import import
  artifacts:
    when: always
    paths:
      - logs/
    expire_in: 30 days
  variables:
    SNYK_LOG_PATH: ./logs
```

### Daily Sync Pipeline

```yaml
snyk-sync:
  image: alpine:latest
  stage: sync
  only:
    - schedules
  before_script:
    - apk add --no-cache curl jq
    - curl -Lo /usr/local/bin/snyk-api-import \
        https://github.com/snyk/snyk-api-import/releases/latest/download/snyk-api-import-linux-amd64
    - chmod +x /usr/local/bin/snyk-api-import
    - mkdir -p logs
  script:
    - |
      for org_id in ${SNYK_ORG_IDS}; do
        echo "Syncing org: $org_id"
        snyk-api-import sync \
          --source=gitlab \
          --orgPublicId=$org_id || echo "Failed to sync $org_id"
      done
  artifacts:
    when: always
    paths:
      - logs/
    expire_in: 7 days
  variables:
    SNYK_LOG_PATH: ./logs
    SNYK_ORG_IDS: "org-123 org-456 org-789"
```

---

## Jenkins

### Jenkinsfile for Weekly Import

```groovy
pipeline {
    agent any

    triggers {
        // Run every Sunday at 2 AM
        cron('0 2 * * 0')
    }

    environment {
        SNYK_TOKEN = credentials('snyk-api-token')
        GITHUB_TOKEN = credentials('github-pat')
        SNYK_LOG_PATH = "${WORKSPACE}/logs"
        SNYK_GROUP_ID = 'your-group-id'
    }

    stages {
        stage('Setup') {
            steps {
                sh '''
                    curl -Lo snyk-api-import \
                        https://github.com/snyk/snyk-api-import/releases/latest/download/snyk-api-import-linux-amd64
                    chmod +x snyk-api-import
                    mkdir -p logs
                '''
            }
        }

        stage('Generate Org Data') {
            steps {
                sh '''
                    ./snyk-api-import orgs:data \
                        --source=github \
                        --groupId=${SNYK_GROUP_ID} \
                        --skipEmptyOrgs
                '''
            }
        }

        stage('Create Orgs') {
            steps {
                sh '''
                    ./snyk-api-import orgs:create \
                        --file=logs/group-${SNYK_GROUP_ID}-github-orgs.json
                '''
            }
        }

        stage('Generate Import Targets') {
            steps {
                sh '''
                    ./snyk-api-import import:data \
                        --source=github \
                        --orgsData=logs/snyk-created-orgs.json
                '''
            }
        }

        stage('Run Import') {
            steps {
                sh './snyk-api-import import'
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'logs/**/*', fingerprint: true
        }
        failure {
            emailext(
                subject: "Snyk Import Failed - ${BUILD_NUMBER}",
                body: "Import job failed. Check logs for details.",
                to: "devops@company.com"
            )
        }
    }
}
```

---

## Kubernetes CronJob

### Import CronJob

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: snyk-import-script
data:
  import.sh: |
    #!/bin/sh
    set -e

    echo "Starting Snyk import..."

    snyk-api-import orgs:data \
      --source=github \
      --groupId=${SNYK_GROUP_ID} \
      --skipEmptyOrgs

    snyk-api-import orgs:create \
      --file=${SNYK_LOG_PATH}/group-${SNYK_GROUP_ID}-github-orgs.json

    snyk-api-import import:data \
      --source=github \
      --orgsData=${SNYK_LOG_PATH}/snyk-created-orgs.json

    snyk-api-import import

    echo "Import completed successfully"

---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: snyk-import
spec:
  # Run every Sunday at 2 AM
  schedule: "0 2 * * 0"
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: snyk-import
            image: alpine:latest
            command:
              - /bin/sh
              - /scripts/import.sh
            env:
            - name: SNYK_TOKEN
              valueFrom:
                secretKeyRef:
                  name: snyk-credentials
                  key: token
            - name: GITHUB_TOKEN
              valueFrom:
                secretKeyRef:
                  name: github-credentials
                  key: token
            - name: SNYK_GROUP_ID
              value: "your-group-id"
            - name: SNYK_LOG_PATH
              value: "/logs"
            volumeMounts:
            - name: logs
              mountPath: /logs
            - name: scripts
              mountPath: /scripts
          volumes:
          - name: logs
            persistentVolumeClaim:
              claimName: snyk-import-logs
          - name: scripts
            configMap:
              name: snyk-import-script
              defaultMode: 0755
          restartPolicy: OnFailure

---
apiVersion: v1
kind: Secret
metadata:
  name: snyk-credentials
type: Opaque
stringData:
  token: your-snyk-token-here

---
apiVersion: v1
kind: Secret
metadata:
  name: github-credentials
type: Opaque
stringData:
  token: your-github-token-here

---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: snyk-import-logs
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
```

### Sync CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: snyk-sync
spec:
  # Run daily at 3 AM
  schedule: "0 3 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: snyk-sync
            image: alpine:latest
            command:
              - /bin/sh
              - -c
              - |
                for org_id in ${SNYK_ORG_IDS}; do
                  echo "Syncing org: $org_id"
                  snyk-api-import sync \
                    --source=github \
                    --orgPublicId=$org_id
                done
            env:
            - name: SNYK_TOKEN
              valueFrom:
                secretKeyRef:
                  name: snyk-credentials
                  key: token
            - name: GITHUB_TOKEN
              valueFrom:
                secretKeyRef:
                  name: github-credentials
                  key: token
            - name: SNYK_ORG_IDS
              value: "org-123 org-456 org-789"
            - name: SNYK_LOG_PATH
              value: "/logs"
            volumeMounts:
            - name: logs
              mountPath: /logs
          volumes:
          - name: logs
            persistentVolumeClaim:
              claimName: snyk-import-logs
          restartPolicy: OnFailure
```

---

## AWS Lambda

### Serverless Framework Example

```yaml
# serverless.yml
service: snyk-import

provider:
  name: aws
  runtime: provided.al2
  region: us-east-1
  timeout: 900  # 15 minutes
  memorySize: 1024
  environment:
    SNYK_TOKEN: ${env:SNYK_TOKEN}
    GITHUB_TOKEN: ${env:GITHUB_TOKEN}
    SNYK_GROUP_ID: ${env:SNYK_GROUP_ID}
    SNYK_LOG_PATH: /tmp/logs

functions:
  import:
    handler: bootstrap
    events:
      # Run every Sunday at 2 AM UTC
      - schedule: cron(0 2 ? * SUN *)
    layers:
      - arn:aws:lambda:us-east-1:xxx:layer:snyk-api-import:1

plugins:
  - serverless-plugin-custom-binary

custom:
  customBinary:
    url: https://github.com/snyk/snyk-api-import/releases/latest/download/snyk-api-import-linux-amd64
```

### Lambda Handler Script

```bash
#!/bin/bash
# bootstrap

set -e

export SNYK_LOG_PATH=/tmp/logs
mkdir -p $SNYK_LOG_PATH

/opt/snyk-api-import orgs:data \
  --source=github \
  --groupId=${SNYK_GROUP_ID} \
  --skipEmptyOrgs

/opt/snyk-api-import orgs:create \
  --file=${SNYK_LOG_PATH}/group-${SNYK_GROUP_ID}-github-orgs.json

/opt/snyk-api-import import:data \
  --source=github \
  --orgsData=${SNYK_LOG_PATH}/snyk-created-orgs.json

/opt/snyk-api-import import

# Upload logs to S3
aws s3 sync $SNYK_LOG_PATH s3://my-snyk-logs/$(date +%Y-%m-%d)/
```

---

## Azure Pipelines

```yaml
# azure-pipelines.yml
trigger: none

schedules:
- cron: "0 2 * * 0"
  displayName: Weekly Import
  branches:
    include:
    - main
  always: true

pool:
  vmImage: 'ubuntu-latest'

variables:
  SNYK_LOG_PATH: $(Build.ArtifactStagingDirectory)/logs

steps:
- task: Bash@3
  displayName: 'Download snyk-api-import'
  inputs:
    targetType: 'inline'
    script: |
      curl -Lo snyk-api-import \
        https://github.com/snyk/snyk-api-import/releases/latest/download/snyk-api-import-linux-amd64
      chmod +x snyk-api-import
      mkdir -p $(SNYK_LOG_PATH)

- task: Bash@3
  displayName: 'Generate org data'
  env:
    SNYK_TOKEN: $(SNYK_TOKEN)
    GITHUB_TOKEN: $(GITHUB_TOKEN)
  inputs:
    targetType: 'inline'
    script: |
      ./snyk-api-import orgs:data \
        --source=github \
        --groupId=$(SNYK_GROUP_ID) \
        --skipEmptyOrgs

- task: Bash@3
  displayName: 'Create orgs'
  env:
    SNYK_TOKEN: $(SNYK_TOKEN)
  inputs:
    targetType: 'inline'
    script: |
      ./snyk-api-import orgs:create \
        --file=$(SNYK_LOG_PATH)/group-$(SNYK_GROUP_ID)-github-orgs.json

- task: Bash@3
  displayName: 'Generate import targets'
  env:
    SNYK_TOKEN: $(SNYK_TOKEN)
    GITHUB_TOKEN: $(GITHUB_TOKEN)
  inputs:
    targetType: 'inline'
    script: |
      ./snyk-api-import import:data \
        --source=github \
        --orgsData=$(SNYK_LOG_PATH)/snyk-created-orgs.json

- task: Bash@3
  displayName: 'Run import'
  env:
    SNYK_TOKEN: $(SNYK_TOKEN)
  inputs:
    targetType: 'inline'
    script: ./snyk-api-import import

- task: PublishBuildArtifacts@1
  displayName: 'Publish logs'
  condition: always()
  inputs:
    PathtoPublish: '$(SNYK_LOG_PATH)'
    ArtifactName: 'import-logs'
    publishLocation: 'Container'
```

---

## Best Practices

### 1. Secret Management

- **Never** hardcode tokens in CI config
- Use your platform's secret management
- Rotate tokens regularly
- Use service accounts, not personal tokens

### 2. Error Handling

```bash
# Example: Send alerts on failure
if ! snyk-api-import import; then
  curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
    -H 'Content-Type: application/json' \
    -d '{"text":"Snyk import failed! Check logs."}'
  exit 1
fi
```

### 3. Log Retention

- Keep logs for 30 days minimum
- Archive important runs longer
- Set up log rotation
- Monitor disk space

### 4. Scheduling

- **Initial Import**: Weekly or on-demand
- **Sync**: Daily or more frequent
- **Avoid**: Peak business hours
- **Consider**: Time zones

### 5. Monitoring

Set up alerts for:

- Job failures
- High failure rates (>10% failed projects)
- Long execution times
- Rate limiting errors

---

For more detailed workflows, see [Advanced Workflows](../advanced-workflows.md)
