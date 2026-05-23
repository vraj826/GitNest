import mongoose from 'mongoose';
import Repository from '../models/Repository.model.js';
import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/AppError.js';
import { sendSuccess } from '../utils/responseHandlers.js';
import { logActivity } from '../services/activity.service.js';
import ACTIVITY_TYPES from '../constants/activityTypes.js';

export const createRepository = asyncHandler(async (req, res, next)=> {
    const { name, description, visibility, language, topics } = req.body;

    if(!name) {
        return next(new AppError('Repository name is required', 400));
    }

    const existingRepo = await Repository.findOne({
        owner: req.user.id,
        name,
    });

    if (existingRepo) {
        return next(
            new AppError('You already have a repository with this name', 400)
        );
    }

    const repository = await Repository.create({
        name,
        owner: req.user.id,
        description,
        visibility,
        language,
        topics,
    });

    try {
        await logActivity({
            actor: req.user.id,
            type: ACTIVITY_TYPES.REPOSITORY_CREATED,
            repository: repository._id,
            metadata: {
                repoName: repository.name,
                visibility: repository.visibility,
            },
        });
    } catch {
        // Prevent activity logging failures from blocking repository creation
    }

    sendSuccess(res, 201, repository, 'Repository created successfully');
});

export const getRepository = asyncHandler(async (req, res, next) => {
    const { username, reponame } = req.params;

    const repository = await Repository.findOne({ name: reponame})
    .populate('owner', 'username avatarUrl bio');

    if(!repository) {
        return next(new AppError('Repository not found', 404));
    }

    if(
        repository.visibility === 'private' &&
        repository.owner._id.toString() !== req.user?.id
    ) {
        return next(new AppError('Repository not found', 404));
    }

    sendSuccess(res, 200, repository);
});

export const getUserRepositories = asyncHandler(async (req, res, next) => {
    const { username } = req.params;

    const repositories = await Repository.find()
    .populate({
        path: 'owner',
        match: { username },
        select: 'username avatarUrl',
    })
    .then((repos) => repos.filter((r) => r.owner !== null));

    const filtered = repositories.filter((r) => {
        if(r.visibility === 'public') return true;
        if(req.user && r.owner._id.toString() === req.user.id) return true;
        return false;
    });

    sendSuccess(res, 200, filtered);
});

export const updateRepository = asyncHandler(async(req, res, next) => {
    const { username, reponame } = req.params;

    const repository = await Repository.findOne({
        name: reponame,
        owner: req.user.id,
    });

    if(!repository) {
        return next(new AppError('Repository not found', 404));
    }

    const { description, visibility, language, topics, defaultBranch } =
    req.body;

    repository.description = description ?? repository.description;
    repository.visibility = visibility ?? repository.visibility;
    repository.language = language ?? repository.language;
    repository.topics = topics ?? repository.topics;
    repository.defaultBranch = defaultBranch ?? repository.defaultBranch;

    await repository.save();

    sendSuccess(res, 200, repository, 'Repository updated successfully');
});

export const deleteRepository = asyncHandler(async (req, res, next) => {
    const { reponame } = req.params;

    const repository = await Repository.findOne({
        name: reponame,
        owner: req.user.id,
    });

    if(!repository) {
        return next(new AppError('Repository not found', 404));
    }

    await repository.deleteOne();

    sendSuccess(res, 200, null, 'Repository deleted successfully');
});

export const starRepository = asyncHandler(async(req, res, next) => {
    const { reponame } = req.params;

    const repository = await Repository.findOne({ name: reponame });

    if(!repository) {
        return next(new AppError('Repository not found', 404));
    }

    const result = await Repository.updateOne(
        { _id: repository._id, stars: { $ne: req.user.id } },
        { $addToSet: { stars: req.user.id } }
    );

    if (result.modifiedCount > 0) {
        try {
            await logActivity({
                actor: req.user.id,
                type: ACTIVITY_TYPES.REPOSITORY_STARRED,
                repository: repository._id,
                metadata: {
                    repoName: repository.name,
                },
            });
        } catch {
            // Prevent activity logging failures from blocking star actions
        }
    }

    const updated = await Repository.findById(repository._id);
    sendSuccess(res, 200, { stars: updated.stars.length }, 'Repository starred successfully');
});

export const forkRepository = asyncHandler(async (req, res, next) => {
    const { reponame } = req.params;

    const original = await Repository.findOne({ name: reponame });

    if(!original) {
        return next(new AppError('Repository not found', 404));
    }

    if (original.owner.toString() === req.user.id) {
        return next(new AppError('You cannot fork your own repository', 404));
    }

    const session = await mongoose.startSession();
    let forked;
    try {
        session.startTransaction();

        const existing = await Repository.findOne({
            name: reponame,
            owner: req.user.id,
            forkedFrom: original._id,
        });

        if (existing) {
            await session.abortTransaction();
            return next(new AppError('You have already forked this repository', 400));
        }

        [forked] = await Repository.create([{
            name: original.name,
            owner: req.user.id,
            description: original.description,
            visibility: 'public',
            language: original.language,
            topics: original.topics,
            defaultBranch: original.defaultBranch,
            forkedFrom: original._id,
        }], { session });

        await Repository.findByIdAndUpdate(
            original._id,
            { $addToSet: { forks: forked._id } },
            { session }
        );

        await session.commitTransaction();
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        if (error.code === 11000) {
            return next(new AppError('You have already forked this repository', 400));
        }
        return next(new AppError('Fork operation failed', 500));
    } finally {
        session.endSession();
    }

    sendSuccess(res, 201, forked, 'Repository forked successfully');
});