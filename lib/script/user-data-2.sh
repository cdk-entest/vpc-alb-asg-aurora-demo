#!/bin/bash
# kill -9 $(lsof -t -i:8080)
export SECRET_ID=AuroraStackIcaDatabaseSecre-VKUdDUkkkWIc
export REGION=ap-southeast-1
wget https://github.com/cdk-entest/vpc-alb-asg-aurora-demo/archive/refs/heads/master.zip 
unzip master.zip 
cd vpc-alb-asg-aurora-demo-master/
python3 -m ensurepip --upgrade
python3 -m pip install -r requirements.txt
cd web-app
python3 -m app