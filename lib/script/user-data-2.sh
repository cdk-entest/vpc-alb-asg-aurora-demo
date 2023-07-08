#!/bin/bash
# kill -9 $(lsof -t -i:8080)
export REGION=ap-southeast-1
wget https://github.com/cdk-entest/vpc-alb-asg-aurora-demo/archive/refs/heads/main.zip
unzip main.zip 
cd vpc-alb-asg-aurora-demo-main/
python3 -m pip install -r requirements.txt
cd web-app
python3 -m app