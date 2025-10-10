import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { authenticateRequest } from "../middleware/auth";
import { PaperService } from "../services/paper.service";

// List all papers
async function listPapers(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "read");

    // Check if tag and type filters are provided
    const tagId = request.query.get("tagId");
    const type = request.query.get("type");

    let papers;
    if (tagId) {
      papers = await PaperService.listPapersByTag(auth.sub, tagId, type);
    } else {
      papers = await PaperService.listUserPapers(auth.sub, type);
    }

    return {
      jsonBody: papers,
      status: 200,
    };
  } catch (error) {
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

// Create a new paper
async function createPaper(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "write");
    const body: any = await request.json();

    // Validate request
    if (!body.tags || !Array.isArray(body.tags) || body.tags.length === 0) {
      return {
        jsonBody: { error: "A tag is required" },
        status: 400,
      };
    }

    if (!body.type) {
      return {
        jsonBody: { error: "Type is required" },
        status: 400,
      };
    }

    const paper = await PaperService.createPaper(auth.sub, body);

    return {
      jsonBody: paper,
      status: 201,
    };
  } catch (error) {
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

// Update a paper
async function updatePaper(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const id = request.params.id;
    const auth = await authenticateRequest(request, "write");
    const updates = await request.json();

    if (!id) {
      return {
        jsonBody: { error: "Paper ID is required" },
        status: 400,
      };
    }

    const updatedPaper = await PaperService.updatePaper(id, auth.sub, updates);

    return {
      jsonBody: updatedPaper,
      status: 200,
    };
  } catch (error) {
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

// Delete a paper
async function deletePaper(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const id = request.params.id;
    const auth = await authenticateRequest(request, "write");

    if (!id) {
      return {
        jsonBody: { error: "Paper ID is required" },
        status: 400,
      };
    }

    const result = await PaperService.deletePaper(id, auth.sub);

    return {
      jsonBody: result,
      status: 200,
    };
  } catch (error) {
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

// Register HTTP endpoints
app.http("listPapers", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "papers",
  handler: listPapers,
});

app.http("createPaper", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "papers",
  handler: createPaper,
});

app.http("updatePaper", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "papers/{id}",
  handler: updatePaper,
});

app.http("deletePaper", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "papers/{id}",
  handler: deletePaper,
});
