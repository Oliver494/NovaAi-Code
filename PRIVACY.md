# Privacy

Vareliox does not require a Vareliox account and does not include advertising or analytics telemetry.

## Data stored locally

- Project list and interface preferences.
- Conversation history scoped to each project.
- Provider endpoints, selected models, and timeout settings.
- File-access and terminal permission preferences.
- API keys in the operating-system credential store, not in project files or browser local storage.

## Data sent to providers

When using Ollama or LM Studio, requests are sent to the configured local endpoint. When using a cloud provider, messages, attached files/images, and selected project context are sent directly to that provider under its own terms and privacy policy.

Vareliox should show the files attached to a request. Do not attach secrets, private keys, `.env` files, customer data, or source code you are not allowed to share.

Terminal output used to continue an AI answer becomes part of that provider request. It can contain paths, usernames, environment details, or command output, so review commands before approving them when using a cloud provider.

## Updates

The application can contact GitHub to check public Vareliox releases. The check sends the normal network information required for an HTTPS request; Vareliox does not add a user identifier.

## Deleting data

Chats can be deleted from the application. Provider keys can be removed from provider settings. Removing a project from Vareliox does not delete the project folder itself.
