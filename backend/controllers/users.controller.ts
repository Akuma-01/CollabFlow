import { NextFunction, Request, Response } from 'express';
import * as userService from '../services/users.service';
import { AppError } from '../utils/AppError';

// GET
export const searchUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const q = (req.query.q as string)?.trim() ?? '';
    if (q.length < 2) {
      return next(new AppError('Search query must be at least 2 characters', 400));
    }
    const users = await userService.searchUsers(q);
    res.status(200).json({ success: true, data: users });

  } catch (err) {
    next(err);
  }
};
