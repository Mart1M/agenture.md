 █████╗  ██████╗ ███████╗███╗   ██╗████████╗██╗   ██╗██████╗ ███████╗
██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝██║   ██║██╔══██╗██╔════╝
███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ██║   ██║██████╔╝█████╗  
██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ██║   ██║██╔══██╗██╔══╝  
██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ╚██████╔╝██║  ██║███████╗
╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚══════╝

## Security

**MCP credentials** — The MCP servers view lets you configure HTTP headers (e.g. `Authorization: Bearer <token>`) for remote servers. These are stored in plain text in `.mcp.json` at the root of your project. If your `.mcp.json` contains authentication tokens, do not commit it to a public repository. Add it to your `.gitignore`:

```
.mcp.json
```