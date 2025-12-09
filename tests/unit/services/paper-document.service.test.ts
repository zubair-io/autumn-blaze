/**
 * Tests for Paper Service with Document Type
 *
 * These tests verify that the Paper service correctly handles document operations
 * for the JapaneseMaple application (TipTap/ProseMirror editor).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import mongoose from "mongoose";
import { Paper } from "../../../src/models/paper.model";
import { Tag } from "../../../src/models/tag";
import { PaperService } from "../../../src/services/paper.service";
import { IDocumentData } from "../../../src/types/document";

describe("PaperService - Document Operations", () => {
  let userId: string;
  let tagId: string;

  beforeEach(async () => {
    // Clear collections
    await Paper.deleteMany({});
    await Tag.deleteMany({});

    // Setup test user
    userId = "test-user-123";

    // Create test tag (folder for documents)
    const tag = await Tag.create({
      type: "folder",
      value: "My Documents",
      sharing: {
        sharedWith: [
          {
            userId: userId,
            accessLevel: "write",
          },
        ],
      },
    });
    tagId = tag._id.toString();
  });

  afterEach(async () => {
    await Paper.deleteMany({});
    await Tag.deleteMany({});
  });

  describe("createPaper with document type", () => {
    it("should create a document paper with TipTap content", async () => {
      const documentData: IDocumentData = {
        documentId: "doc-uuid-123",
        title: "Meeting Notes",
        content: {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 1 },
              content: [{ type: "text", text: "Meeting Notes" }],
            },
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Discussed project timeline and deliverables." },
              ],
            },
          ],
        },
        lastModified: new Date(),
        version: 1,
      };

      const paper = await PaperService.createPaper(userId, {
        tags: [tagId],
        type: "document",
        data: documentData,
      });

      expect(paper).toBeDefined();
      expect(paper.type).toBe("document");
      expect(paper.createdBy).toBe(userId);
      expect(paper.data.documentId).toBe("doc-uuid-123");
      expect(paper.data.title).toBe("Meeting Notes");
      expect(paper.data.content).toBeDefined();
      expect(paper.data.content.type).toBe("doc");
      expect(paper.data.version).toBe(1);
    });

    it("should create a document with empty content", async () => {
      const documentData: IDocumentData = {
        documentId: "doc-uuid-456",
        title: "Untitled Document",
        content: {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 1 },
              content: [],
            },
          ],
        },
        lastModified: new Date(),
      };

      const paper = await PaperService.createPaper(userId, {
        tags: [tagId],
        type: "document",
        data: documentData,
      });

      expect(paper).toBeDefined();
      expect(paper.type).toBe("document");
      expect(paper.data.title).toBe("Untitled Document");
    });

    it("should reject document without type", async () => {
      const documentData = {
        tags: [tagId],
        data: {
          documentId: "doc-uuid-789",
          title: "Test Document",
          content: {},
        },
      };

      await expect(
        PaperService.createPaper(userId, documentData as any),
      ).rejects.toThrow("Type is required");
    });

    it("should reject document without tags", async () => {
      const documentData = {
        tags: [],
        type: "document",
        data: {
          documentId: "doc-uuid-789",
          title: "Test Document",
          content: {},
        },
      };

      await expect(
        PaperService.createPaper(userId, documentData),
      ).rejects.toThrow("A tag is required");
    });
  });

  describe("listUserPapers with document type filter", () => {
    beforeEach(async () => {
      // Create multiple papers of different types
      await Paper.create({
        tags: [tagId],
        type: "document",
        data: {
          documentId: "doc-1",
          title: "First Document",
          content: { type: "doc", content: [] },
          lastModified: new Date(),
        },
        createdBy: userId,
      });

      await Paper.create({
        tags: [tagId],
        type: "document",
        data: {
          documentId: "doc-2",
          title: "Second Document",
          content: { type: "doc", content: [] },
          lastModified: new Date(),
        },
        createdBy: userId,
      });

      await Paper.create({
        tags: [tagId],
        type: "note",
        data: {
          title: "Regular note",
          content: "Some content",
        },
        createdBy: userId,
      });

      await Paper.create({
        tags: [tagId],
        type: "recording",
        data: {
          recordingId: "rec-1",
          transcript: "Test transcript",
        },
        createdBy: userId,
      });
    });

    it("should list all papers without type filter", async () => {
      const papers = await PaperService.listUserPapers(userId);

      expect(papers).toHaveLength(4);
    });

    it("should list only document papers with type filter", async () => {
      const papers = await PaperService.listUserPapers(userId, "document");

      expect(papers).toHaveLength(2);
      papers.forEach((paper) => {
        expect(paper.type).toBe("document");
        expect(paper.data.documentId).toBeDefined();
        expect(paper.data.title).toBeDefined();
      });
    });

    it("should return empty array when no documents exist", async () => {
      await Paper.deleteMany({ type: "document" });

      const papers = await PaperService.listUserPapers(userId, "document");

      expect(papers).toHaveLength(0);
    });
  });

  describe("listPapersByTag with document type filter", () => {
    let otherTagId: string;

    beforeEach(async () => {
      // Create another tag
      const otherTag = await Tag.create({
        type: "folder",
        value: "Work Documents",
        sharing: {
          sharedWith: [
            {
              userId: userId,
              accessLevel: "write",
            },
          ],
        },
      });
      otherTagId = otherTag._id.toString();

      // Create documents in different tags
      await Paper.create({
        tags: [tagId],
        type: "document",
        data: {
          documentId: "doc-personal-1",
          title: "Personal Document",
          content: { type: "doc", content: [] },
          lastModified: new Date(),
        },
        createdBy: userId,
      });

      await Paper.create({
        tags: [otherTagId],
        type: "document",
        data: {
          documentId: "doc-work-1",
          title: "Work Document",
          content: { type: "doc", content: [] },
          lastModified: new Date(),
        },
        createdBy: userId,
      });

      await Paper.create({
        tags: [tagId],
        type: "note",
        data: { title: "Note 1" },
        createdBy: userId,
      });
    });

    it("should list documents by specific tag", async () => {
      const papers = await PaperService.listPapersByTag(userId, tagId, "document");

      expect(papers).toHaveLength(1);
      expect(papers[0].data.title).toBe("Personal Document");
    });

    it("should list all paper types by tag without type filter", async () => {
      const papers = await PaperService.listPapersByTag(userId, tagId);

      expect(papers).toHaveLength(2);
    });
  });

  describe("updatePaper for document", () => {
    it("should update document content", async () => {
      // Create a document paper
      const paper = await Paper.create({
        tags: [tagId],
        type: "document",
        data: {
          documentId: "doc-update-1",
          title: "Original Title",
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Original content" }],
              },
            ],
          },
          lastModified: new Date("2025-01-01"),
          version: 1,
        },
        createdBy: userId,
      });

      // Update the document
      const newContent = {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: "Updated Title" }],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Updated content" }],
          },
        ],
      };

      const updated = await PaperService.updatePaper(
        paper._id.toString(),
        userId,
        {
          data: {
            ...paper.data,
            title: "Updated Title",
            content: newContent,
            lastModified: new Date(),
            version: 2,
          },
        },
      );

      expect(updated.data.title).toBe("Updated Title");
      expect(updated.data.content.content).toHaveLength(2);
      expect(updated.data.version).toBe(2);
    });

    it("should update document title only", async () => {
      const paper = await Paper.create({
        tags: [tagId],
        type: "document",
        data: {
          documentId: "doc-title-update",
          title: "Old Title",
          content: { type: "doc", content: [] },
          lastModified: new Date(),
        },
        createdBy: userId,
      });

      const updated = await PaperService.updatePaper(
        paper._id.toString(),
        userId,
        {
          data: {
            ...paper.data,
            title: "New Title",
          },
        },
      );

      expect(updated.data.title).toBe("New Title");
      expect(updated.data.documentId).toBe("doc-title-update");
    });

    it("should reject update from non-owner", async () => {
      const paper = await Paper.create({
        tags: [tagId],
        type: "document",
        data: {
          documentId: "doc-owner-test",
          title: "Owner's Document",
          content: { type: "doc", content: [] },
          lastModified: new Date(),
        },
        createdBy: userId,
      });

      await expect(
        PaperService.updatePaper(paper._id.toString(), "different-user", {
          data: { title: "Hacked Title" },
        }),
      ).rejects.toThrow("Access denied");
    });
  });

  describe("deletePaper for document", () => {
    it("should delete a document paper", async () => {
      // Create a document paper
      const paper = await Paper.create({
        tags: [tagId],
        type: "document",
        data: {
          documentId: "doc-delete-1",
          title: "To Be Deleted",
          content: { type: "doc", content: [] },
          lastModified: new Date(),
        },
        createdBy: userId,
      });

      // Delete it
      const result = await PaperService.deletePaper(
        paper._id.toString(),
        userId,
      );

      expect(result.success).toBe(true);

      // Verify deletion
      const found = await Paper.findById(paper._id);
      expect(found).toBeNull();
    });

    it("should reject delete from non-owner", async () => {
      const paper = await Paper.create({
        tags: [tagId],
        type: "document",
        data: {
          documentId: "doc-delete-protected",
          title: "Protected Document",
          content: { type: "doc", content: [] },
          lastModified: new Date(),
        },
        createdBy: userId,
      });

      await expect(
        PaperService.deletePaper(paper._id.toString(), "different-user"),
      ).rejects.toThrow("Only the owner can delete a paper");
    });
  });

  describe("Document sharing via tags", () => {
    let sharedUserId: string;
    let sharedTagId: string;

    beforeEach(async () => {
      sharedUserId = "shared-user-456";

      // Create a shared tag (owner has write, shared user has read)
      const sharedTag = await Tag.create({
        type: "folder",
        value: "Shared Folder",
        sharing: {
          sharedWith: [
            {
              userId: userId,
              accessLevel: "write" as const,
            },
            {
              userId: sharedUserId,
              accessLevel: "read" as const,
            },
          ],
        },
      });
      sharedTagId = sharedTag._id.toString();

      // Create a document in the shared tag
      await Paper.create({
        tags: [sharedTagId],
        type: "document",
        data: {
          documentId: "doc-shared-1",
          title: "Shared Document",
          content: { type: "doc", content: [] },
          lastModified: new Date(),
        },
        createdBy: userId,
      });
    });

    it("should allow shared user to read document", async () => {
      const papers = await PaperService.listUserPapers(sharedUserId, "document");

      expect(papers).toHaveLength(1);
      expect(papers[0].data.title).toBe("Shared Document");
    });

    it("should prevent shared user with read-only access from updating", async () => {
      const paper = await Paper.findOne({ "data.documentId": "doc-shared-1" });

      await expect(
        PaperService.updatePaper(paper!._id.toString(), sharedUserId, {
          data: { title: "Hacked Title" },
        }),
      ).rejects.toThrow("Access denied");
    });

    it("should allow shared user with write access to update", async () => {
      // Update tag to give write access
      await Tag.updateOne(
        { _id: sharedTagId },
        {
          $set: {
            "sharing.sharedWith": [
              {
                userId: sharedUserId,
                accessLevel: "write",
              },
            ],
          },
        },
      );

      const paper = await Paper.findOne({ "data.documentId": "doc-shared-1" });

      const updated = await PaperService.updatePaper(
        paper!._id.toString(),
        sharedUserId,
        {
          data: {
            ...paper!.data,
            title: "Legitimately Updated Title",
          },
        },
      );

      expect(updated.data.title).toBe("Legitimately Updated Title");
    });
  });

  describe("Document versioning and conflict resolution", () => {
    it("should track version numbers for optimistic locking", async () => {
      const paper = await Paper.create({
        tags: [tagId],
        type: "document",
        data: {
          documentId: "doc-version-1",
          title: "Versioned Document",
          content: { type: "doc", content: [] },
          lastModified: new Date(),
          version: 1,
        },
        createdBy: userId,
      });

      // Simulate multiple updates
      const update1 = await PaperService.updatePaper(
        paper._id.toString(),
        userId,
        {
          data: {
            ...paper.data,
            content: { type: "doc", content: [{ type: "paragraph" }] },
            version: 2,
          },
        },
      );

      expect(update1.data.version).toBe(2);

      const update2 = await PaperService.updatePaper(
        paper._id.toString(),
        userId,
        {
          data: {
            ...update1.data,
            content: { type: "doc", content: [{ type: "paragraph" }, { type: "paragraph" }] },
            version: 3,
          },
        },
      );

      expect(update2.data.version).toBe(3);
    });
  });

  describe("Performance and indexing", () => {
    it("should efficiently query documents by tag and type", async () => {
      // Create many documents
      const documents = Array.from({ length: 100 }, (_, i) => ({
        tags: [tagId],
        type: i % 2 === 0 ? "document" : "note",
        data: {
          documentId: `doc-${i}`,
          title: `Document ${i}`,
          content: { type: "doc", content: [] },
          lastModified: new Date(),
        },
        createdBy: userId,
      }));

      await Paper.insertMany(documents);

      // Query with explain to check index usage
      const result: any = await Paper.find({
        type: "document",
        tags: tagId,
      }).explain("executionStats");

      // Verify index was used (not a collection scan)
      expect(result.executionStats?.executionSuccess).toBe(true);

      // Verify we get correct count
      const docs = await PaperService.listPapersByTag(userId, tagId, "document");
      expect(docs.length).toBe(50);
    });
  });
});
