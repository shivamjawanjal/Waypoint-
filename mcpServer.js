const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { ListToolsRequestSchema, CallToolRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const Project = require("./models/Project");

// 1. Initialize the MCP server
const server = new Server(
  {
    name: "waypoint-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 2. Define the tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_projects",
        description: "List all projects in the Waypoint mind-map planner, showing project IDs, names, titles, and creation/update times.",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "get_project",
        description: "Retrieve a single project by ID with all its nodes, status, and notes. Helpful to see the entire mind-map structure.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "The MongoDB ID of the project to retrieve" }
          },
          required: ["projectId"]
        }
      },
      {
        name: "create_project",
        description: "Create a new project plan with a name and title.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Short lowercase identifier/slug (e.g., 'auth-system')" },
            title: { type: "string", description: "Human-readable title (e.g., 'Implement Authentication System')" },
            provider: { type: "string", enum: ["gemini", "groq"], description: "The AI provider used to build this plan (optional)" },
            rawText: { type: "string", description: "Raw AI plan text / markdown (optional)" },
            nodes: {
              type: "array",
              description: "Initial plan nodes (optional)",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  parentId: { type: "string" },
                  type: { type: "string", enum: ["phase", "milestone", "file", "task"] },
                  label: { type: "string" },
                  status: { type: "string", enum: ["pending", "progress", "done"] },
                  notes: { type: "string" },
                  checklist: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        text: { type: "string" },
                        done: { type: "boolean" }
                      },
                      required: ["id", "text"]
                    }
                  }
                },
                required: ["id", "label"]
              }
            }
          },
          required: ["name", "title"]
        }
      },
      {
        name: "add_node",
        description: "Add a new node (phase, milestone, file, or task) to an existing project.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "The ID of the project" },
            node: {
              type: "object",
              properties: {
                id: { type: "string", description: "Unique node ID (e.g., 'node_123')" },
                parentId: { type: "string", description: "Parent node ID (null if root)" },
                type: { type: "string", enum: ["phase", "milestone", "file", "task"], description: "The type of node" },
                label: { type: "string", description: "Label/title of the node" },
                status: { type: "string", enum: ["pending", "progress", "done"], description: "Current status" },
                notes: { type: "string", description: "Notes associated with the node (optional)" },
                checklist: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      text: { type: "string" },
                      done: { type: "boolean" }
                    },
                    required: ["id", "text"]
                  }
                }
              },
              required: ["id", "type", "label"]
            }
          },
          required: ["projectId", "node"]
        }
      },
      {
        name: "update_node_status",
        description: "Update the status of a specific node (e.g., set to 'pending', 'progress', or 'done') in a project.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "The ID of the project" },
            nodeId: { type: "string", description: "The ID of the node to update" },
            status: { type: "string", enum: ["pending", "progress", "done"], description: "The new status of the node" }
          },
          required: ["projectId", "nodeId", "status"]
        }
      },
      {
        name: "add_checklist_item",
        description: "Add a new checklist item to a specific node in a project.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "The ID of the project" },
            nodeId: { type: "string", description: "The ID of the node" },
            text: { type: "string", description: "Checklist item text" },
            itemId: { type: "string", description: "Optional unique item ID. If omitted, will be auto-generated." }
          },
          required: ["projectId", "nodeId", "text"]
        }
      },
      {
        name: "update_checklist_item",
        description: "Mark a checklist item within a specific node as completed or not completed.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "The ID of the project" },
            nodeId: { type: "string", description: "The ID of the node" },
            itemId: { type: "string", description: "The ID of the checklist item to update" },
            done: { type: "boolean", description: "True if completed, false if not" }
          },
          required: ["projectId", "nodeId", "itemId", "done"]
        }
      },
      {
        name: "update_node_notes",
        description: "Update or set notes for a specific node in a project.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "The ID of the project" },
            nodeId: { type: "string", description: "The ID of the node" },
            notes: { type: "string", description: "The notes text" }
          },
          required: ["projectId", "nodeId", "notes"]
        }
      }
    ]
  };
});

// 3. Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name, arguments: args } = request.params;

  const requestInfo = extra && extra.requestInfo;
  const authInfo = extra && extra.authInfo;

  // Authentication & Authorization check
  const enforceAuth = (requiredRole) => {
    // If it's an HTTP/SSE request, enforce auth rules.
    // If it's a local STDIO request (no HTTP requestInfo), we trust it.
    if (requestInfo) {
      if (!authInfo) {
        throw new Error("Authentication required: No user session found for this request. Please login first.");
      }
      
      if (requiredRole && authInfo.role !== requiredRole) {
        throw new Error(`Forbidden: Only users with the '${requiredRole}' role can modify projects. Your role is '${authInfo.role}'.`);
      }
    }
  };

  try {
    switch (name) {
      case "list_projects": {
        enforceAuth(); // Must be logged in to view
        const projects = await Project.find().sort({ createdAt: -1 });
        const text = projects.map(p => 
          `- ID: ${p._id}\n  Slug: ${p.name}\n  Title: ${p.title}\n  Nodes: ${p.nodes.length}\n  Updated: ${p.updatedAt}`
        ).join("\n\n") || "No projects found in database.";

        return {
          content: [{ type: "text", text }]
        };
      }

      case "get_project": {
        enforceAuth(); // Must be logged in to view
        const { projectId } = args;
        const project = await Project.findById(projectId);
        if (!project) {
          return {
            isError: true,
            content: [{ type: "text", text: `Project with ID ${projectId} not found.` }]
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(project.toObject(), null, 2) }]
        };
      }

      case "create_project": {
        enforceAuth('admin'); // Only admins can create projects
        const { name: projName, title, provider, rawText, nodes } = args;
        const project = await Project.create({
          name: projName,
          title,
          provider: provider || "gemini",
          rawText: rawText || "",
          nodes: nodes || []
        });
        return {
          content: [
            {
              type: "text",
              text: `Project successfully created:\nID: ${project._id}\nTitle: ${project.title}\nSlug: ${project.name}`
            }
          ]
        };
      }

      case "add_node": {
        enforceAuth('admin'); // Only admins can modify
        const { projectId, node } = args;
        const project = await Project.findById(projectId);
        if (!project) {
          return {
            isError: true,
            content: [{ type: "text", text: `Project with ID ${projectId} not found.` }]
          };
        }

        // Validate that node.id is unique in the project
        if (project.nodes.some(n => n.id === node.id)) {
          return {
            isError: true,
            content: [{ type: "text", text: `Node ID '${node.id}' already exists in this project.` }]
          };
        }

        project.nodes.push({
          id: node.id,
          parentId: node.parentId || null,
          type: node.type,
          label: node.label,
          status: node.status || "pending",
          notes: node.notes || "",
          checklist: node.checklist || []
        });

        await project.save();
        return {
          content: [{ type: "text", text: `Node '${node.label}' successfully added to project ${projectId}.` }]
        };
      }

      case "update_node_status": {
        enforceAuth('admin'); // Only admins can modify
        const { projectId, nodeId, status } = args;
        const project = await Project.findById(projectId);
        if (!project) {
          return {
            isError: true,
            content: [{ type: "text", text: `Project with ID ${projectId} not found.` }]
          };
        }

        const node = project.nodes.find(n => n.id === nodeId);
        if (!node) {
          return {
            isError: true,
            content: [{ type: "text", text: `Node with ID ${nodeId} not found in project.` }]
          };
        }

        node.status = status;
        await project.save();
        return {
          content: [{ type: "text", text: `Status of node '${node.label}' (${nodeId}) updated to '${status}'.` }]
        };
      }

      case "add_checklist_item": {
        enforceAuth('admin'); // Only admins can modify
        const { projectId, nodeId, text, itemId } = args;
        const project = await Project.findById(projectId);
        if (!project) {
          return {
            isError: true,
            content: [{ type: "text", text: `Project with ID ${projectId} not found.` }]
          };
        }

        const node = project.nodes.find(n => n.id === nodeId);
        if (!node) {
          return {
            isError: true,
            content: [{ type: "text", text: `Node with ID ${nodeId} not found in project.` }]
          };
        }

        const actualItemId = itemId || `item_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        node.checklist.push({ id: actualItemId, text, done: false });
        await project.save();

        return {
          content: [{ type: "text", text: `Checklist item '${text}' (ID: ${actualItemId}) added to node '${node.label}'.` }]
        };
      }

      case "update_checklist_item": {
        enforceAuth('admin'); // Only admins can modify
        const { projectId, nodeId, itemId, done } = args;
        const project = await Project.findById(projectId);
        if (!project) {
          return {
            isError: true,
            content: [{ type: "text", text: `Project with ID ${projectId} not found.` }]
          };
        }

        const node = project.nodes.find(n => n.id === nodeId);
        if (!node) {
          return {
            isError: true,
            content: [{ type: "text", text: `Node with ID ${nodeId} not found in project.` }]
          };
        }

        const item = node.checklist.find(i => i.id === itemId);
        if (!item) {
          return {
            isError: true,
            content: [{ type: "text", text: `Checklist item with ID ${itemId} not found in node '${node.label}'.` }]
          };
        }

        item.done = done;
        await project.save();
        return {
          content: [{ type: "text", text: `Checklist item '${item.text}' marked as ${done ? "done" : "todo"}.` }]
        };
      }

      case "update_node_notes": {
        enforceAuth('admin'); // Only admins can modify
        const { projectId, nodeId, notes } = args;
        const project = await Project.findById(projectId);
        if (!project) {
          return {
            isError: true,
            content: [{ type: "text", text: `Project with ID ${projectId} not found.` }]
          };
        }

        const node = project.nodes.find(n => n.id === nodeId);
        if (!node) {
          return {
            isError: true,
            content: [{ type: "text", text: `Node with ID ${nodeId} not found in project.` }]
          };
        }

        node.notes = notes;
        await project.save();
        return {
          content: [{ type: "text", text: `Notes updated for node '${node.label}'.` }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    console.error(`Error in tool execution (${name}):`, err);
    return {
      isError: true,
      content: [{ type: "text", text: `Error: ${err.message}` }]
    };
  }
});

module.exports = server;
