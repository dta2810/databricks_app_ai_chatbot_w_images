# Databricks Configuration Setup

## Quick Start

1. **Copy the template file:**
   ```bash
   cp databricks.yml.template databricks.yml
   ```

2. **Edit `databricks.yml` with your configuration:**
   - **App Name**: Replace `your-app-name-here` with your desired app name (lowercase letters, numbers, and dashes only)
   - **Serving Endpoints**: Add your serving endpoint names (e.g., `mas-394759f1-endpoint`, `ka-e56bd39b-endpoint`)
   - **Optional Resources**: Uncomment and configure SQL warehouses, Genie spaces, or database resources as needed

3. **Deploy to Databricks:**
   ```bash
   # Deploy to dev environment
   databricks bundle deploy --profile YOUR_PROFILE -t dev --var="serving_endpoint_name=YOUR_ENDPOINT_NAME"
   
   # Or sync files only
   databricks sync . /Workspace/Users/YOUR_EMAIL@databricks.com/YOUR_APP_NAME --profile YOUR_PROFILE
   ```

## Configuration Options

### Required

- **`name`**: Your app name (must use lowercase letters, numbers, and dashes only)
  - Example: `beverages-multi-assistant-app`
  
- **`serving_endpoint_name`**: Your primary MAS/agent serving endpoint
  - Pass via CLI: `--var="serving_endpoint_name=mas-xxxxxx-endpoint"`
  - Or set default in databricks.yml

### Optional Resources

#### Additional Serving Endpoints
```yaml
- name: serving-endpoint-2
  description: "Additional serving endpoint for AI agent"
  serving_endpoint:
    name: ka-e56bd39b-endpoint
    permission: CAN_QUERY
```

#### SQL Warehouse Access
```yaml
- name: sql-warehouse
  description: "SQL warehouse for data queries"
  sql_warehouse:
    id: a87bbad85fdabab8  # Get ID from warehouse URL or CLI
    permission: CAN_USE
```

#### Genie Space Access
```yaml
- name: genie-space
  description: "Genie space for AI-powered data queries"
  genie_space:
    name: your_genie_space_name
    space_id: your_genie_space_name
    permission: CAN_RUN
```

#### Database Instance (for persistent chat history)
```yaml
resources:
  database_instances:
    chatbot_lakebase:
      name: ${var.database_instance_name}-${var.resource_name_suffix}
      capacity: CU_1

# Then add to app resources:
- name: database
  description: "Lakebase database instance for the chat app"
  database:
    database_name: databricks_postgres
    instance_name: ${resources.database_instances.chatbot_lakebase.name}
    permission: CAN_CONNECT_AND_CREATE
```

## Deployment Profiles

The configuration supports three deployment targets:

- **`dev`** (default): Development environment with user-specific suffix
- **`staging`**: Staging environment for testing
- **`prod`**: Production environment

Deploy to specific target:
```bash
databricks bundle deploy --profile YOUR_PROFILE -t staging --var="serving_endpoint_name=YOUR_ENDPOINT"
```

## Permissions

You need the following permissions on resources before adding them to the app:

- **Serving Endpoints**: `CAN_VIEW` and `CAN_QUERY`
- **SQL Warehouses**: `CAN_VIEW` and `CAN_USE`
- **Genie Spaces**: `CAN_VIEW` and `CAN_RUN`

Grant permissions in Databricks workspace before deployment to avoid permission errors.

## Troubleshooting

### App Name Error
```
App name must contain only lowercase letters, numbers, and dashes
```
**Solution**: Use only lowercase letters, numbers, and dashes (no underscores or uppercase)

### Permission Error
```
You need "Can View" permission to perform this action
```
**Solution**: Ensure you have appropriate permissions on all resources (serving endpoints, warehouses, etc.)

### Certificate Error (macOS)
```
tls: failed to verify certificate: x509: OSStatus -26276
```
**Solution**: Add `required_permissions: ['all']` when running CLI commands

## Example Configuration

```yaml
apps:
  databricks_chatbot:
    name: my-chatbot-app
    description: "My agentic chat application"
    source_code_path: .
    resources:
      - name: serving-endpoint
        serving_endpoint:
          name: mas-394759f1-endpoint
          permission: CAN_QUERY
      - name: serving-endpoint-2
        serving_endpoint:
          name: ka-e56bd39b-endpoint
          permission: CAN_QUERY
      - name: sql-warehouse
        sql_warehouse:
          id: a87bbad85fdabab8
          permission: CAN_USE
```

## Notes

- The `databricks.yml` file is git-ignored to prevent committing sensitive configuration
- Always use `databricks.yml.template` as the reference for new deployments
- Keep your profile name and endpoint names secure
