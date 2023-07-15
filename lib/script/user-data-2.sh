#!/bin/bash
# kill -9 $(lsof -t -i:8080)
# secrete id 
export SECRET_ID=aurora-secrete-name
# secret region
export REGION=ap-southeast-1
# download vim configuration
wget -O ~/.vimrc https://raw.githubusercontent.com/cdk-entest/basic-vim/main/.vimrc 
# download web app
wget https://github.com/cdk-entest/vpc-alb-asg-aurora-demo/archive/refs/heads/master.zip 
unzip master.zip 
cd vpc-alb-asg-aurora-demo-master/
# install pip 
python3 -m ensurepip --upgrade
# install dependencies in requirements.txt
python3 -m pip install -r requirements.txt
# run the flask app
cd web-app
python3 -m app
