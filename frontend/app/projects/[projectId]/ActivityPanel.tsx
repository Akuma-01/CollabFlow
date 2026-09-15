"use client";

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { ACTIVITY_FILTERS, ActivityAction, ActivityPage, ActivityRecord, activityPath, describeActivity } from '@/lib/activity';

function ActivityItem({ event }: { event: ActivityRecord }) {
	const description = describeActivity(event);
	const date = new Date(event.created_at);
	const dateLabel = Number.isNaN(date.getTime()) ? null : date.toLocaleString(undefined, {
		day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
	});
	const details = description.details.length > 0 && (
		<dl className="mt-2 space-y-2 text-xs text-gray-600">
			{description.details.map(detail => (
				<div key={detail.label}>
					<dt className="font-medium text-gray-700">{detail.label}</dt>
					<dd className="mt-0.5 whitespace-pre-wrap [overflow-wrap:anywhere]">
						{detail.from !== undefined && <><span className="sr-only">From </span>{detail.from}<span aria-hidden="true"> → </span><span className="sr-only"> to </span></>}
						{detail.to}
					</dd>
				</div>
			))}
		</dl>
	);
	return (
		<li className="flex gap-3 px-4 py-5 sm:px-5">
			<span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
				{event.actor_name?.trim().slice(0, 1).toUpperCase() || '?'}
			</span>
			<div className="min-w-0 flex-1">
				<p className="text-sm leading-6 text-gray-700 [overflow-wrap:anywhere]">
					<span className="font-semibold text-gray-900">{event.actor_name || 'Unknown member'}</span> {description.summary}
				</p>
				<p className="mt-0.5 text-xs text-gray-500">
					{dateLabel ? <time dateTime={event.created_at}>{dateLabel}</time> : 'Time unavailable'}
				</p>
				{description.expandable && details ? (
					<details className="mt-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
						<summary className="cursor-pointer text-xs font-medium text-gray-700">View changes</summary>
						{details}
					</details>
				) : details}
				{description.note && <p className="mt-2 text-xs text-gray-500">{description.note}</p>}
			</div>
		</li>
	);
}

function failure(error: unknown) {
	const status = error instanceof ApiError ? error.status : 0;
	return {
		status,
		message: status === 401 ? 'Your session has expired. Sign in to view activity.'
			: status === 403 ? 'You no longer have access to this project’s activity.'
				: status === 404 ? 'This project is no longer available.'
					: 'Could not load activity. Please try again.',
	};
}

function ActivityFeed({ projectId, action, revision, onRefresh }: { projectId: string; action: ActivityAction | ''; revision: number; onRefresh: () => void }) {
	const [page, setPage] = useState<ActivityPage>({ data: [], nextCursor: null });
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<ReturnType<typeof failure> | null>(null);
	const active = useRef(false);
	const inFlight = useRef(false);
	const [paged, setPaged] = useState(false);
	const [loadedRevision, setLoadedRevision] = useState(revision);

	useEffect(() => {
		let cancelled = false;
		active.current = true;
		if (!paged) api.get<ActivityPage>(activityPath(projectId, action))
			.then(result => { if (!cancelled) { setPage(result); setLoadedRevision(revision); setError(null); } })
			.catch(err => {
				if (cancelled) return;
				const problem = failure(err);
				if ([401, 403, 404].includes(problem.status)) setPage({ data: [], nextCursor: null });
				setError(problem);
			})
			.finally(() => { if (!cancelled) setLoading(false); });
		return () => { cancelled = true; active.current = false; };
	}, [projectId, action, revision, paged]);

	const loadMore = async () => {
		if (!page.nextCursor || inFlight.current || loading) return;
		inFlight.current = true;
		setPaged(true);
		setLoading(true);
		setError(null);
		try {
			const result = await api.get<ActivityPage>(activityPath(projectId, action, page.nextCursor));
			if (!active.current) return;
			setPage(previous => {
				const seen = new Set(previous.data.map(event => event.id));
				return { data: [...previous.data, ...result.data.filter(event => !seen.has(event.id))], nextCursor: result.nextCursor };
			});
		} catch (err) {
			if (!active.current) return;
			const problem = failure(err);
			if ([401, 403, 404].includes(problem.status)) setPage({ data: [], nextCursor: null });
			setError(problem);
		} finally {
			inFlight.current = false;
			if (active.current) setLoading(false);
		}
	};

	return (
		<div>
			{revision !== loadedRevision && paged && (
				<div className="border-b border-blue-100 bg-blue-50 px-5 py-3 text-sm text-blue-700">
					Project changes available. <button type="button" onClick={onRefresh} className="font-medium underline">Show latest activity</button>
				</div>
			)}
			{error && (
				<div role="alert" className="mx-4 my-4 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700 sm:mx-5">
					<p>{error.message}</p>
					{error.status === 401 ? <Link href="/login" className="mt-2 inline-block font-medium underline">Sign in</Link>
						: [403, 404].includes(error.status) ? <Link href="/dashboard" className="mt-2 inline-block font-medium underline">Back to Dashboard</Link>
							: <button type="button" onClick={paged && page.data.length ? loadMore : onRefresh} className="mt-2 font-medium underline">Try again</button>}
				</div>
			)}
			{page.data.length > 0 && <ol aria-label="Project activity" className="divide-y divide-gray-100">{page.data.map(event => <ActivityItem key={event.id} event={event} />)}</ol>}
			<div role="status" className="px-5 py-4 text-center text-sm text-gray-500">
				{loading ? 'Loading activity…' : !error && page.data.length === 0
					? action ? 'No activity matches this filter.' : 'No activity yet. New project changes will appear here.'
					: !error ? `${page.data.length} event${page.data.length === 1 ? '' : 's'} shown${page.nextCursor ? '' : ' · You’re all caught up'}` : null}
			</div>
			{page.nextCursor && !error && (
				<div className="px-5 pb-5 text-center">
					<button type="button" disabled={loading} onClick={loadMore}
						className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50">
						Load older activity
					</button>
				</div>
			)}
		</div>
	);
}

export default function ActivityPanel({ projectId, revision }: { projectId: string; revision: number }) {
	const [action, setAction] = useState<ActivityAction | ''>('');
	const [refresh, setRefresh] = useState(0);
	const reload = () => setRefresh(value => value + 1);
	return (
		<section aria-labelledby="activity-heading" className="rounded-xl border border-gray-200 bg-white shadow-sm">
			<div className="flex flex-wrap items-end justify-between gap-4 border-b border-gray-100 px-4 py-4 sm:px-5">
				<div>
					<h2 id="activity-heading" className="text-sm font-semibold text-gray-900">Activity</h2>
					<p className="mt-1 text-xs text-gray-500">Project history, newest first.</p>
				</div>
				<div className="flex flex-wrap items-end gap-2">
					<label className="text-xs font-medium text-gray-600">
						Activity type
						<select value={action} onChange={event => setAction(event.target.value as ActivityAction | '')}
							className="mt-1 block rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-blue-500">
							<option value="">All activity</option>
							{ACTIVITY_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
						</select>
					</label>
					<button type="button" onClick={reload} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50">Refresh</button>
				</div>
			</div>
			{/* A new query gets an empty feed immediately. Cleanup prevents an older
			    response from replacing a new filter, refreshed page, or project. */}
			<ActivityFeed key={`${projectId}:${action}:${refresh}`} projectId={projectId} action={action} revision={revision} onRefresh={reload} />
		</section>
	);
}
