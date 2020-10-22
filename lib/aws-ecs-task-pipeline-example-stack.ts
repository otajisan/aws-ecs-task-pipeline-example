import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as logs from '@aws-cdk/aws-logs';
import {PythonFunction} from "@aws-cdk/aws-lambda-python";
import * as lambda from "@aws-cdk/aws-lambda";
import * as events from "@aws-cdk/aws-events";
import * as targets from "@aws-cdk/aws-events-targets";
import {EventPattern} from "@aws-cdk/aws-events/lib/event-pattern";
import {ScheduledFargateTask} from "@aws-cdk/aws-ecs-patterns";
import {EcsTask} from "@aws-cdk/aws-events-targets";

export class AwsEcsTaskPipelineExampleStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      cidr: '10.0.0.0/16',
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    // Container
    const containerName = 'otajisan/spring-batch-kotlin-example';

    // ECS Tasks
    const nameEcsTaskA = 'ecs-task-a';
    const nameEcsTaskB = 'ecs-task-b';

    const clusterA = new ecs.Cluster(this, `${nameEcsTaskA}-cluster`, {
      vpc: vpc,
      clusterName: `${nameEcsTaskA}-cluster`,
    });

    const clusterB = new ecs.Cluster(this, `${nameEcsTaskB}-cluster`, {
      vpc: vpc,
      clusterName: `${nameEcsTaskB}-cluster`,
    });

    const ecsTaskA = this.createNewEcsTask(vpc, nameEcsTaskA, containerName);
    const ecsTaskB = this.createNewEcsTask(vpc, nameEcsTaskB, containerName);

    // Lambda (for debug ECS Task Events)
    const lambdaFn = new PythonFunction(this, 'LambdaFn', {
      vpc: vpc,
      functionName: 'EcsTaskPipelineExampleDebugLambda',
      entry: 'lambda/ecs-task-pipeline',
      handler: 'lambda_handler',
      runtime: lambda.Runtime.PYTHON_3_8,
      timeout: cdk.Duration.seconds(30),
    });

    const eventPattern: EventPattern = {
      source: ['aws.ecs'],
      detailType: ['ECS Task State Change'],
      detail: {
        lastStatus: ['STOPPED'],
        clusterArn: [clusterA.clusterArn],
        stoppedReason: ['Essential container in task exited'],
      },
    }

    // Cloud Watch Events
    // Lambda for Debug ECS Task events
    new events.Rule(this, 'RuleLaunchLambda', {
      ruleName: 'rule-ecs-task-pipeline-launch-lambda',
      eventPattern: eventPattern,
      targets: [
        new targets.LambdaFunction(lambdaFn),
      ]
    });

    // Cron Schedule to launch Ecs Task A
    new ScheduledFargateTask(this, 'EcsTaskA', {
      schedule: events.Schedule.cron({
        minute: '*/10',
        hour: '*',
        day: '*',
        month: '*',
        year: '*',
      }),
      scheduledFargateTaskDefinitionOptions: {
        taskDefinition: ecsTaskA,
      },
      cluster: clusterA,
      desiredTaskCount: 1,
    });

    // Same of the above
    // new events.Rule(this, 'RuleLaunchEcsTaskA', {
    //   ruleName: 'rule-ecs-task-pipeline-launch-ecs-task-a',
    //   schedule: events.Schedule.cron({
    //     minute: '*/10',
    //     hour: '*',
    //     day: '*',
    //     month: '*',
    //     year: '*',
    //   }),
    //   targets: [
    //     new targets.EcsTask({
    //       cluster: clusterA,
    //       taskDefinition: ecsTaskA,
    //     })
    //   ],
    // });

    // launch Ecs Task B if Ecs Task A exited
    new events.Rule(this, 'RuleLaunchEcsTaskB', {
      ruleName: `rule-launch-${nameEcsTaskB}`,
      eventPattern: eventPattern,
      targets: [
        new targets.EcsTask({
          cluster: clusterB,
          taskDefinition: ecsTaskB,
        })
      ],
    });
  }

  /**
   * create a new ECS Task (on Fargate)
   *
   * @param vpc
   * @param serviceName
   * @param containerName
   * @private
   */
  private createNewEcsTask(vpc: ec2.IVpc, serviceName: string, containerName: string) {
    // Logging
    const logDriver = new ecs.AwsLogDriver({
      logGroup: new logs.LogGroup(this, `${serviceName}-log-group`, {
        logGroupName: serviceName,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      streamPrefix: serviceName,
    });

    // Fargate
    const taskDef = new ecs.FargateTaskDefinition(this, `${serviceName}-taskdef`, {
      family: `${serviceName}-taskdef`,
      memoryLimitMiB: 1024,
      cpu: 256,
    });

    taskDef.addContainer(`${serviceName}-container`, {
      image: ecs.ContainerImage.fromRegistry(containerName),
      memoryLimitMiB: 256,
      logging: logDriver,
    });

    return taskDef;
  }
}
