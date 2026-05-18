import { NextFunction, Request, Response } from 'express';
import hasRole from '../middlewares/hasRole.middleware';
import * as projectsService from '../services/projects.service';

jest.mock('../services/projects.service');
const mockGetProjectAccess = projectsService.getProjectAccess as jest.Mock;

function makeReq(userId: number, projectId: number): Partial<Request> {
	return {
		user: { id: userId, email: 'x@x.com', name: 'X' },
		params: { projectId: String(projectId) },
	};
}

describe('hasRole middleware', () => {
	let next: NextFunction;

	beforeEach(() => {
		next = jest.fn();
	});

	it('calls next() for the project owner regardless of allowedRoles', async () => {
		mockGetProjectAccess.mockResolvedValue({ owner_id: 1, role: null });
		await hasRole(['editor'])(makeReq(1, 10) as Request, {} as Response, next);
		expect(next).toHaveBeenCalledWith(); // no args = pass
	});

	it('calls next() for a member with an allowed role', async () => {
		mockGetProjectAccess.mockResolvedValue({ owner_id: 99, role: 'editor' });
		await hasRole(['editor', 'owner'])(makeReq(2, 10) as Request, {} as Response, next);
		expect(next).toHaveBeenCalledWith();
	});

	it('calls next with 403 for a member with insufficient role', async () => {
		mockGetProjectAccess.mockResolvedValue({ owner_id: 99, role: 'viewer' });
		await hasRole(['editor'])(makeReq(2, 10) as Request, {} as Response, next);
		expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
	});

	it('calls next with 403 for a non-member', async () => {
		mockGetProjectAccess.mockResolvedValue({ owner_id: 99, role: null });
		await hasRole(['editor'])(makeReq(2, 10) as Request, {} as Response, next);
		expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
	});

	it('calls next with 404 when project does not exist', async () => {
		mockGetProjectAccess.mockResolvedValue(undefined);
		await hasRole(['editor'])(makeReq(1, 999) as Request, {} as Response, next);
		expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
	});

	it('calls next with error when the service throws', async () => {
		mockGetProjectAccess.mockRejectedValue(new Error('DB error'));
		await hasRole(['editor'])(makeReq(1, 10) as Request, {} as Response, next);
		expect(next).toHaveBeenCalledWith(expect.any(Error));
	});
});
