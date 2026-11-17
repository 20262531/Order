"""Run in Google Cloud Shell. Merge receipt-only lifecycle rule into existing rules."""
import json,subprocess,tempfile,pathlib
bucket='gs://laya-order.firebasestorage.app'
def run(*args):return subprocess.check_output(['gcloud',*args],text=True)
metadata=json.loads(run('storage','buckets','describe',bucket,'--format=json'))
existing=metadata.get('lifecycle',metadata.get('lifecycle_config',{})) or {}
rules=existing.get('rule',[])
rule={'action':{'type':'Delete'},'condition':{'age':3,'matchesPrefix':['orders/photo-'],'matchesSuffix':['/receipt']}}
if rule not in rules:rules.append(rule)
backup=pathlib.Path('bucket-before-photo-retention.json');backup.write_text(json.dumps(metadata,indent=2))
config=pathlib.Path('photo-retention-merged.json');config.write_text(json.dumps({'rule':rules},indent=2))
subprocess.run(['gcloud','storage','buckets','update',bucket,'--lifecycle-file='+str(config)],check=True)
print('Lifecycle configured. Receipt photos aged 3 days become eligible for automatic deletion. Existing matching old photos are included. Processing is asynchronous.')
print('Soft delete / versioning may retain deleted bytes: inspect bucket Protection settings. This script does not alter those settings.')
