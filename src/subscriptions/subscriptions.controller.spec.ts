import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionsController } from './subscriptions.controller';
import { StellarPaymentService } from './stellar-payment.service';
import { CreateStellarSubscriptionDto } from './dto/create-stellar-subscription.dto';

describe('SubscriptionsController', () => {
  let controller: SubscriptionsController;
  let stellarPaymentService: StellarPaymentService;

  const mockStellarPaymentService = {
    createPaymentIntent: jest.fn(),
    getPendingPaymentIntents: jest.fn(),
    verifyPayment: jest.fn(),
  };

  const mockRequest = (userId: number) => ({
    user: { id: userId },
  } as any);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [
        {
          provide: StellarPaymentService,
          useValue: mockStellarPaymentService,
        },
      ],
    }).compile();

    controller = module.get<SubscriptionsController>(SubscriptionsController);
    stellarPaymentService = module.get<StellarPaymentService>(StellarPaymentService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createStellarPaymentIntent', () => {
    it('should create payment intent', async () => {
      const dto: CreateStellarSubscriptionDto = {
        plan: 'pro',
        asset: 'xlm',
        amount: 10,
        walletId: '1',
      };

      const mockPaymentIntent = {
        id: 'intent123',
        amount: 10,
        asset: 'xlm',
        destination: 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H',
        memo: 'CLIPS-1-abc123',
        expiresAt: new Date(),
        status: 'pending',
      };

      (mockStellarPaymentService.createPaymentIntent as jest.Mock).mockResolvedValue(mockPaymentIntent);

      const result = await controller.createStellarPaymentIntent(dto, mockRequest(1));

      expect(result).toEqual(mockPaymentIntent);
      expect(mockStellarPaymentService.createPaymentIntent).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('getPendingPaymentIntents', () => {
    it('should return pending payment intents', async () => {
      const mockIntents = [
        {
          id: 'intent1',
          amount: 10,
          asset: 'xlm',
          destination: 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H',
          memo: 'CLIPS-1-abc123',
          expiresAt: new Date(),
          status: 'pending' as const,
        },
      ];

      (mockStellarPaymentService.getPendingPaymentIntents as jest.Mock).mockResolvedValue(mockIntents);

      const result = await controller.getPendingPaymentIntents(mockRequest(1));

      expect(result).toEqual(mockIntents);
      expect(mockStellarPaymentService.getPendingPaymentIntents).toHaveBeenCalledWith(1);
    });
  });

  describe('verifyStellarPayment', () => {
    it('should verify payment', async () => {
      const paymentIntentId = 'intent123';
      const transactionHash = 'tx123abc';

      (mockStellarPaymentService.verifyPayment as jest.Mock).mockResolvedValue(true);

      const result = await controller.verifyStellarPayment(paymentIntentId, transactionHash);

      expect(result).toEqual({ verified: true });
      expect(mockStellarPaymentService.verifyPayment).toHaveBeenCalledWith(paymentIntentId, transactionHash);
    });
  });
});
