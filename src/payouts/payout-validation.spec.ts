import { ValidationPipe } from '@nestjs/common';
import { CreatePayoutDto } from './dto/request-payout.dto';
import { InitiateStellarPayoutDto } from './dto/initiate-stellar-payout.dto';

describe('Payout DTO validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  it('trims strings and transforms amount on CreatePayoutDto', async () => {
    const result = await pipe.transform(
      { amount: '120', currency: ' USD ', method: ' stellar ' },
      {
        type: 'body',
        metatype: CreatePayoutDto,
      },
    );

    expect(result).toEqual({
      amount: 120,
      currency: 'USD',
      method: 'stellar',
    });
  });

  it('rejects unexpected properties on CreatePayoutDto', async () => {
    await expect(
      pipe.transform(
        {
          amount: 120,
          currency: 'USD',
          method: 'stellar',
          unexpected: 'nope',
        },
        {
          type: 'body',
          metatype: CreatePayoutDto,
        },
      ),
    ).rejects.toMatchObject({
      response: {
        message: expect.arrayContaining([
          'property unexpected should not exist',
        ]),
      },
    });
  });

  it('transforms numeric strings on InitiateStellarPayoutDto', async () => {
    const result = await pipe.transform(
      { payoutId: '101', amount: '100' },
      {
        type: 'body',
        metatype: InitiateStellarPayoutDto,
      },
    );

    expect(result).toEqual({
      payoutId: 101,
      amount: 100,
    });
  });

  it('rejects unexpected properties on InitiateStellarPayoutDto', async () => {
    await expect(
      pipe.transform(
        { payoutId: 101, amount: 100, unexpected: true },
        {
          type: 'body',
          metatype: InitiateStellarPayoutDto,
        },
      ),
    ).rejects.toMatchObject({
      response: {
        message: expect.arrayContaining([
          'property unexpected should not exist',
        ]),
      },
    });
  });
});
