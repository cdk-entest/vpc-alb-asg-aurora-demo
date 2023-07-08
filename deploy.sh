cdk bootstrap aws://236494511063/ap-southeast-1
cdk --app 'npx ts-node --prefer-ts-exts bin/alb-asg-aurora-demo-v2.ts' synth
cdk --app 'npx ts-node --prefer-ts-exts bin/alb-asg-aurora-demo-v2.ts' deploy --all 