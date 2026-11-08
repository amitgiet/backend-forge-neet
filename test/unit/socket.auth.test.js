const jwt = require('jsonwebtoken');
const socketServiceFactory = require('../../src/services/socketService');
const redisClient = require('../../src/config/redis');

describe('Socket.IO Gateway & Authentication Handshake', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'testsecret123456789012345678901234';
  let mockIo;
  let middlewareFn;
  let connectionHandler;

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  beforeEach(() => {
    mockIo = {
      use: jest.fn((fn) => {
        middlewareFn = fn;
      }),
      on: jest.fn((event, handler) => {
        if (event === 'connection') {
          connectionHandler = handler;
        }
      }),
      to: jest.fn().mockReturnThis(),
      emit: jest.fn()
    };
  });

  it('rejects connection when no auth token is provided', (done) => {
    socketServiceFactory(mockIo);

    const mockSocket = {
      handshake: { auth: {}, headers: {} }
    };

    middlewareFn(mockSocket, (err) => {
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Authentication token required');
      done();
    });
  });

  it('rejects connection when token is invalid', (done) => {
    socketServiceFactory(mockIo);

    const mockSocket = {
      handshake: {
        auth: { token: 'invalid.jwt.token' },
        headers: {}
      }
    };

    middlewareFn(mockSocket, (err) => {
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Invalid authentication token');
      done();
    });
  });

  it('authenticates valid token and attaches user payload', (done) => {
    socketServiceFactory(mockIo);

    const validToken = jwt.sign({ id: 'user_12345', role: 'student' }, JWT_SECRET, { expiresIn: '1h' });
    const mockSocket = {
      handshake: {
        auth: { token: validToken },
        headers: {}
      }
    };

    middlewareFn(mockSocket, (err) => {
      expect(err).toBeUndefined();
      expect(mockSocket.user).toBeDefined();
      expect(mockSocket.user.id).toBe('user_12345');
      expect(mockSocket.userId).toBe('user_12345');
      done();
    });
  });

  it('manages 1v1 matchmaking queue and pairs opponents', async () => {
    socketServiceFactory(mockIo);

    const registeredEvents = {};
    const mockSocket1 = {
      id: 'socket_1',
      userId: 'user_player_1',
      user: { id: 'user_player_1' },
      join: jest.fn(),
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
      on: jest.fn((event, cb) => {
        registeredEvents[event] = cb;
      })
    };

    connectionHandler(mockSocket1);

    // Player 1 joins matchmaking
    await registeredEvents['join_matchmaking']();
    expect(mockSocket1.emit).toHaveBeenCalledWith('matchmaking_waiting');

    // Player 2 connects and joins
    const registeredEvents2 = {};
    const mockSocket2 = {
      id: 'socket_2',
      userId: 'user_player_2',
      user: { id: 'user_player_2' },
      join: jest.fn(),
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
      on: jest.fn((event, cb) => {
        registeredEvents2[event] = cb;
      })
    };

    connectionHandler(mockSocket2);
    await registeredEvents2['join_matchmaking']();

    expect(mockSocket2.emit).toHaveBeenCalledWith('match_found', expect.objectContaining({
      opponentId: 'user_player_1'
    }));
  });

  it('enforces anti-cheat timer check on submit_answer', () => {
    socketServiceFactory(mockIo);

    const registeredEvents = {};
    const mockTo = { emit: jest.fn() };
    const mockSocket = {
      id: 'socket_1',
      userId: 'user_cheat_test',
      user: { id: 'user_cheat_test' },
      join: jest.fn(),
      emit: jest.fn(),
      to: jest.fn().mockReturnValue(mockTo),
      on: jest.fn((event, cb) => {
        registeredEvents[event] = cb;
      })
    };

    connectionHandler(mockSocket);

    // Legitimate answer within 15 seconds
    registeredEvents['submit_answer']({
      matchRoom: 'duel_room_1',
      questionIndex: 0,
      isCorrect: true,
      timeSpent: 8
    });

    expect(mockTo.emit).toHaveBeenCalledWith('opponent_progress', expect.objectContaining({
      isCorrect: true,
      scoreIncrement: 4
    }));

    // Cheated answer (>15 seconds) marked incorrect
    registeredEvents['submit_answer']({
      matchRoom: 'duel_room_1',
      questionIndex: 1,
      isCorrect: true,
      timeSpent: 22
    });

    expect(mockTo.emit).toHaveBeenCalledWith('opponent_progress', expect.objectContaining({
      isCorrect: false,
      scoreIncrement: -1
    }));
  });
});
