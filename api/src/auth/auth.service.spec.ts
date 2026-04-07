import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { DatabaseService } from '../database/database.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');
const bcryptMock = bcrypt as jest.Mocked<typeof bcrypt>;

function makeDatabaseMock() {
  return { query: jest.fn() };
}

describe('AuthService', () => {
  let service: AuthService;
  let db: ReturnType<typeof makeDatabaseMock>;

  beforeEach(async () => {
    db = makeDatabaseMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DatabaseService, useValue: db },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('mock-token') },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('register', () => {
    it('throws ConflictException when email already exists', async () => {
      db.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'u-1' }] });

      await expect(
        service.register({ email: 'test@example.com', password: 'pass' }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates user and profile, returns accessToken', async () => {
      db.query
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 'u-new', email: 'test@example.com' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      (bcryptMock.hash as jest.Mock).mockResolvedValue('hashed');

      const result = await service.register({
        email: 'test@example.com',
        password: 'pass',
      });

      expect(result).toEqual({ accessToken: 'mock-token' });
      expect(db.query).toHaveBeenCalledTimes(3);
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException when user not found', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.login({ email: 'no@example.com', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException on wrong password', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 'u-1', email: 'test@example.com', password_hash: 'hash' }],
      });
      (bcryptMock.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'test@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns accessToken on valid credentials', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 'u-1', email: 'test@example.com', password_hash: 'hash' }],
      });
      (bcryptMock.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        email: 'test@example.com',
        password: 'correct',
      });

      expect(result).toEqual({ accessToken: 'mock-token' });
    });
  });
});
