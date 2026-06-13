export declare function extractDbErrorMessage(body: string): string;
export declare function diagnoseDbApiCredentialResponse(status: number, dbErrorMessage?: string): {
    status: string;
    reason: string;
    next_steps: string[];
};
export declare function diagnoseDbApiCredentialErrorMessage(message: string): {
    status: string;
    reason: string;
    next_steps: string[];
};
