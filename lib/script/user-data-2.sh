#!/bin/bash
wget https://github.com/cdk-entest/vpc-alb-asg-aurora-demo/archive/refs/heads/main.zip
unzip main.zip 
cd vpc-alb-asg-aurora-demo-main/
python3 -m pip install -r requirements.txt
cd web-app
python3 -m app