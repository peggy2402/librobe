import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('healthCheck', () => {
    it('should return health status ok', () => {
      const result = appController.healthCheck();
      expect(result.status).toBe('ok');
      expect(result.service).toContain('Library Management System');
      expect(result.docs).toBe('/api/docs');
    });
  });
});
