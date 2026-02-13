export type SecurityRuleContext = {
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  requestResourceData?: any;
};

export class FirestorePermissionError extends Error {
  public context: SecurityRuleContext;
  constructor(context: SecurityRuleContext) {
    const { path, operation } = context;
    const message = `FirestoreError: Missing or insufficient permissions: The following request was denied by Firestore Security Rules:`;
    super(message);
    this.name = 'FirestorePermissionError';
    this.context = context;
    
    // This is to make the error visible in the Next.js dev overlay
    this.cause = JSON.stringify(
      {
        message:
          'This is a contextual error from the application to help debug security rules. See the browser console for the full error details.',
        path,
        operation,
      },
      null,
      2
    );
  }
}
