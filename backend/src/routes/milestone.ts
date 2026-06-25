import { Router } from "express";
import multer from "multer";
import { pinFileToIPFS } from "../services/ipfs.js";

export const milestoneRouter = Router();

// Configure multer storage in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB size limit
  },
});

const uploadSingle = upload.single("file");

/**
 * @openapi
 * /api/milestone/upload:
 *   post:
 *     summary: Upload and pin milestone progress evidence to IPFS
 *     description: Accepts multipart/form-data with a single file (max 10MB), validates type (JPEG, PNG, WEBP, MP4), and pins it to IPFS via Pinata.
 *     tags:
 *       - Milestone
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: File pinned successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cid:
 *                   type: string
 *                 ipfsUrl:
 *                   type: string
 *                 size:
 *                   type: number
 *       400:
 *         description: Missing or invalid file type.
 *       413:
 *         description: File size exceeds 10MB.
 *       500:
 *         description: Pinning operation failed.
 */
milestoneRouter.post("/upload", (req, res, next) => {
  uploadSingle(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          error: "file_too_large",
          message: "File size exceeds the 10MB limit.",
        });
      }
      return res.status(400).json({ error: err.code, message: err.message });
    } else if (err) {
      return res.status(500).json({ error: "upload_failed", message: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        error: "missing_file",
        message: "No file was uploaded. Please attach a file to the request.",
      });
    }

    // Validate MIME types (images: jpg/png/webp, video: mp4)
    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return res.status(400).json({
        error: "invalid_file_type",
        message: "Invalid file type. Only JPEG, PNG, WEBP images and MP4 videos are allowed.",
      });
    }

    // Pin the file to IPFS
    const cid = await pinFileToIPFS(file.buffer, file.originalname);
    const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${cid}`;

    return res.status(201).json({
      cid,
      ipfsUrl,
      size: file.size,
    });
  } catch (error: any) {
    console.error("[MilestoneUpload] Error in upload route:", error);
    return res.status(500).json({
      error: "ipfs_pinning_failed",
      message: error.message || "Failed to upload and pin file to IPFS.",
    });
  }
});
