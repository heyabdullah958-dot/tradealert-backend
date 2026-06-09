import { Test, TestingModule } from '@nestjs/testing';
import { AlertEngineService } from './alert-engine.service';

describe('AlertEngineService', () => {
  let service: AlertEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AlertEngineService],
    }).compile();

    service = module.get<AlertEngineService>(AlertEngineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
