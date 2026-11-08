const doubtController = require('../../src/controllers/doubtController');

jest.mock('../../src/models/Doubt', () => ({
    findOne: jest.fn(),
    findByIdAndUpdate: jest.fn()
}));

const Doubt = require('../../src/models/Doubt');

describe('doubtController.upvoteDoubt - Atomic Toggle', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
        jest.clearAllMocks();
        req = {
            params: { id: 'doubt123' },
            user: { _id: 'user456', id: 'user456' }
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        next = jest.fn();
    });

    test('adds upvote atomically with $addToSet and $inc when user has not upvoted', async () => {
        Doubt.findOne.mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(null)
            })
        });

        Doubt.findByIdAndUpdate.mockReturnValue({
            select: jest.fn().mockResolvedValue({
                _id: 'doubt123',
                upvotes: 5,
                upvotedBy: ['user456']
            })
        });

        await doubtController.upvoteDoubt(req, res, next);

        expect(Doubt.findByIdAndUpdate).toHaveBeenCalledWith(
            'doubt123',
            {
                $addToSet: { upvotedBy: 'user456' },
                $inc: { upvotes: 1 }
            },
            { new: true }
        );

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            upvotes: 5,
            hasUpvoted: true
        }));
    });

    test('removes upvote atomically with $pull and $inc -1 when user previously upvoted', async () => {
        Doubt.findOne.mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({ _id: 'doubt123' })
            })
        });

        Doubt.findByIdAndUpdate.mockReturnValue({
            select: jest.fn().mockResolvedValue({
                _id: 'doubt123',
                upvotes: 4,
                upvotedBy: []
            })
        });

        await doubtController.upvoteDoubt(req, res, next);

        expect(Doubt.findByIdAndUpdate).toHaveBeenCalledWith(
            'doubt123',
            {
                $pull: { upvotedBy: 'user456' },
                $inc: { upvotes: -1 }
            },
            { new: true }
        );

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            upvotes: 4,
            hasUpvoted: false
        }));
    });
});
