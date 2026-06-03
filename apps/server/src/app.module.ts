import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AgentGateway } from "./gateway/agent.gateway";
import { DeviceConnectionService } from "./devices/device-connection.service";
import { TaskService } from "./tasks/task.service";
import { TasksController } from "./tasks/tasks.controller";

@Module({
  controllers: [AppController, TasksController],
  providers: [AgentGateway, DeviceConnectionService, TaskService]
})
export class AppModule {}
