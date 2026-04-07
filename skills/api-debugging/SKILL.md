# API Debugging

## When to Use This Skill

Use this skill when you encounter errors integrating with REST APIs, whether in development, testing, or production. This applies to:

- Authentication failures (401, 403 errors)
- Malformed request bodies or missing required fields
- Missing or incorrect headers
- Unexpected response structures or error messages
- Inconsistent behavior between local and remote environments
- Rate limiting or timeout issues

This skill helps you isolate the root cause systematically rather than guessing.

## Debugging Process

Follow these steps in order to isolate API issues:

1. **Check URL** - Verify the endpoint URL is correct, including protocol (http/https), hostname, port, and path. Confirm the method (GET, POST, PUT, DELETE) matches the API spec.

2. **Check Authentication** - Verify credentials are present and valid. Check token expiration, API key format, and credential encoding. Test with a known-good credential if possible.

3. **Check Headers** - Verify required headers are present (Content-Type, Accept, User-Agent). Confirm header values match API requirements exactly, including capitalization.

4. **Check Payload** - Validate request body structure matches schema. Check for required fields, correct data types, and proper JSON/form encoding. Test with minimal payload first.

5. **Check Response** - Examine full response including status code, headers, and body. Look for error messages in response body. Compare response structure to documentation.

6. **Check Environment** - Verify network connectivity, DNS resolution, proxy settings, and firewall rules. Confirm the API endpoint is accessible from your network. Test from different networks if possible.

## Common Error Patterns

| HTTP Status | Likely Cause | Fix |
|---|---|---|
| 400 Bad Request | Malformed JSON, missing required fields, wrong data type | Validate JSON syntax, check schema, add missing fields |
| 401 Unauthorized | Missing or invalid credentials, expired token | Add auth header, refresh token, check API key |
| 403 Forbidden | Valid credentials but insufficient permissions, wrong scope | Verify account permissions, check OAuth scopes |
| 404 Not Found | Wrong endpoint URL, resource doesn't exist | Verify URL path, check if resource ID is correct |
| 429 Too Many Requests | Rate limit exceeded | Implement backoff, reduce request frequency, check quota |
| 500 Internal Server Error | API server error, database connection issue | Retry with backoff, contact API provider, check status page |
| 503 Service Unavailable | Server temporarily down, maintenance | Wait and retry, check API status page |

## Debug Checklist

### Authentication
- [ ] Is the API key or token present in the request?
- [ ] Is the authentication header correctly formatted (Bearer, Basic, etc.)?
- [ ] Has the token expired or been revoked?
- [ ] Is the credential for the correct environment (sandbox vs. production)?
- [ ] Are credentials stored securely and not hardcoded?

### Request Format
- [ ] Is the HTTP method correct (GET, POST, PUT, DELETE)?
- [ ] Is the request body valid JSON (when applicable)?
- [ ] Do all required fields exist in the payload?
- [ ] Are data types correct (string vs. number vs. boolean)?
- [ ] Is the URL correctly formatted and complete?

### Headers
- [ ] Is Content-Type set to application/json (or appropriate format)?
- [ ] Is Accept header set if required?
- [ ] Are custom headers (e.g., X-API-Key) present and correct?
- [ ] Is User-Agent header present if required?
- [ ] Are header values properly encoded (no extra spaces)?

### Environment
- [ ] Are you connecting to the correct API endpoint (sandbox vs. production)?
- [ ] Is network connectivity available to the endpoint?
- [ ] Are firewall or proxy rules blocking the request?
- [ ] Is DNS resolution working (can you ping the hostname)?
- [ ] Are environment variables correctly set?

## Using curl for Debugging

curl is the gold standard for API debugging. These command patterns help isolate issues:

### Basic request with verbose output
```bash
curl -v https://api.example.com/endpoint
```

### POST with JSON body
```bash
curl -X POST https://api.example.com/endpoint \
  -H "Content-Type: application/json" \
  -d '{"key": "value"}'
```

### With authentication header
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.example.com/endpoint
```

### With multiple headers
```bash
curl -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -H "User-Agent: MyApp/1.0" \
  https://api.example.com/endpoint
```

### Show request and response headers only
```bash
curl -i https://api.example.com/endpoint
```

### Full verbose output (request and response)
```bash
curl -v -X POST https://api.example.com/endpoint \
  -H "Content-Type: application/json" \
  -d '{"key": "value"}'
```

### Save response to file
```bash
curl https://api.example.com/endpoint -o response.json
```

### Print response with formatted JSON
```bash
curl https://api.example.com/endpoint | jq .
```

### Include request body in verbose output
```bash
curl -v --data-raw '{"key": "value"}' \
  -H "Content-Type: application/json" \
  https://api.example.com/endpoint
```

## Guardrails

**Never expose secrets:** Always redact API keys, tokens, and passwords before sharing curl commands or debug output.

**Test safely:** Use sandbox/staging endpoints when available. Never run destructive requests (DELETE, PUT) against production without explicit confirmation.

**Privacy first:** Do not log full request bodies containing personally identifiable information (PII) or sensitive user data.

**Incremental testing:** Start with the simplest possible request (GET the base endpoint). Add complexity one step at a time.
