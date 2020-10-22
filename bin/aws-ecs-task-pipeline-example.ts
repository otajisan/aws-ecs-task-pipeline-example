#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { AwsEcsTaskPipelineExampleStack } from '../lib/aws-ecs-task-pipeline-example-stack';

const app = new cdk.App();
new AwsEcsTaskPipelineExampleStack(app, 'AwsEcsTaskPipelineExampleStack');
