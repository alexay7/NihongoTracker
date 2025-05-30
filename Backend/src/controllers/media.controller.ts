import { Request, Response, NextFunction } from 'express';
import { Anime, Manga, MediaBase, Reading } from '../models/media.model.js';
import { customError } from '../middlewares/errorMiddleware.js';
import fac from 'fast-average-color-node';
import { searchAnilist } from '../services/searchAnilist.js';
import { PipelineStage } from 'mongoose';
import { IMediaDocument } from '../types.js';

export async function getAverageColor(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { imageUrl } = req.query as { imageUrl: string };
    if (!imageUrl) {
      return res.status(400).json({ message: 'Image URL is required' });
    }

    const color = await fac.getAverageColor(imageUrl, {
      algorithm: 'simple',
      mode: 'speed',
      width: 50,
      height: 50,
    });

    return res.status(200).json(color);
  } catch (error) {
    return next(error as customError);
  }
}

export async function getMedia(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const mediaQuery =
      req.params.contentId && req.params.mediaType
        ? { contentId: req.params.contentId, type: req.params.mediaType }
        : req.params.contentId
          ? { contentId: req.params.contentId }
          : {};
    if (mediaQuery.contentId === undefined)
      return res.status(400).json({ message: 'Invalid query parameters' });
    const media = await MediaBase.findOne(mediaQuery);
    if (
      !media &&
      mediaQuery.type &&
      (mediaQuery.type === 'anime' ||
        mediaQuery.type === 'manga' ||
        mediaQuery.type === 'reading')
    ) {
      const mediaAnilist = await searchAnilist({
        ids: [parseInt(mediaQuery.contentId)],
      });
      if (mediaAnilist.length > 0) {
        if (mediaQuery.type === 'anime') {
          await Anime.insertMany(mediaAnilist, {
            ordered: false,
          });
        } else if (mediaQuery.type === 'manga') {
          await Manga.insertMany(mediaAnilist, {
            ordered: false,
          });
        } else if (mediaQuery.type === 'reading') {
          await Reading.insertMany(mediaAnilist, {
            ordered: false,
          });
        }
        return res.status(200).json(mediaAnilist[0]);
      } else {
        return res.status(404).json({ message: 'Media not found' });
      }
    }
    if (!media) return res.status(404).json({ message: 'Media not found' });
    return res.status(200).json(media);
  } catch (error) {
    return next(error as customError);
  }
}

export async function searchMedia(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const title = req.query.search as string;
    const type = req.query.type as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.perPage as string) || 10;
    const skip = (page - 1) * limit;

    if (!title || !type)
      return res.status(400).json({ message: 'Invalid query parameters' });

    const searchAggregation: PipelineStage[] = [
      {
        $match: {
          $text: { $search: title },
          type: type,
        },
      },
      {
        $addFields: {
          score: { $meta: 'textScore' },
        },
      },
      {
        $sort: {
          score: -1,
        },
      },
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },
    ];

    const media: IMediaDocument[] =
      await MediaBase.aggregate(searchAggregation);

    return res.status(200).json(media);
  } catch (error) {
    return next(error as customError);
  }
}
