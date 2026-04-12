import { NextFunction, Request, Response } from 'express';
import * as userService from '../services/users.service';

// GET
export const getUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const users = await userService.getAllUsers();

    res.status(200).json({
      success: true,
      data: users
    });
  } catch (err) {
    next(err);
  }
};
