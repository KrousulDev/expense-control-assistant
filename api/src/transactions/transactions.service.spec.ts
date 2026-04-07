import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { DatabaseService } from '../database/database.service';

function makeDbMock() {
  return { query: jest.fn() };
}

describe('TransactionsService', () => {
  let service: TransactionsService;
  let db: ReturnType<typeof makeDbMock>;

  beforeEach(async () => {
    db = makeDbMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: DatabaseService, useValue: db },
      ],
    }).compile();
    service = module.get(TransactionsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('list returns rows for authenticated user', async () => {
    const rows = [{ id: 'tx-1', user_id: 'u-1', type: 'expense' }];
    db.query.mockResolvedValueOnce({ rows });

    const result = await service.list('u-1', {});
    expect(result).toEqual(rows);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('create inserts and returns new transaction', async () => {
    const newTx = {
      id: 'tx-new',
      user_id: 'u-1',
      type: 'expense',
      amount: '150.00',
    };
    db.query.mockResolvedValueOnce({ rows: [newTx] });

    const result = await service.create('u-1', {
      type: 'expense',
      amount: 150,
      currency: 'MXN',
    });
    expect(result).toEqual(newTx);
  });

  it('remove throws NotFoundException when transaction not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await expect(service.remove('u-1', 'missing-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('remove throws ForbiddenException when user does not own transaction', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 'other-user' }] });

    await expect(service.remove('u-1', 'tx-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('remove deletes transaction owned by user', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 'u-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(service.remove('u-1', 'tx-1')).resolves.toBeUndefined();
    expect(db.query).toHaveBeenCalledTimes(2);
  });
});
