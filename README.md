# DocuMind Suite

Create a simple web app for Multi-Document RAG.

- Support multiple document types: PDF, CSV, and TXT.

- Use LangChain document loaders to process each file type.

- Store document chunks and embeddings in ChromaDB.

- Use LangGraph to orchestrate the RAG workflow.

- Implement a RAG pipeline that retrieves relevant information from the uploaded documents and generates an answer.

- Use actual LangGraph nodes and edges for the RAG workflow; do not create only a visual/mock diagram.

- Add a visual LangGraph workflow showing:

  Document Upload → Document Loader → Chunking → Embeddings → ChromaDB → Retriever → LLM → Answer.

- Show the current workflow step and the flow between nodes when a query is processed.

- Allow users to upload multiple documents and ask questions across them.

- Display the retrieved document chunks/sources used to generate the answer.

- Keep the UI simple, clean, and professional.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f3cffc8d-2875-4efe-809c-20a9de705639).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
