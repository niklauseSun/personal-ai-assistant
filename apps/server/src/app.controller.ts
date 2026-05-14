import { Controller, Get } from "@nestjs/common";

interface HealthResponse {
  status: "ok";
  service: "personal-ai-assistant-server";
  timestamp: string;
}

@Controller()
export class AppController {
  @Get("health")
  getHealth(): HealthResponse {
    return {
      status: "ok",
      service: "personal-ai-assistant-server",
      timestamp: new Date().toISOString()
    };
  }
}
