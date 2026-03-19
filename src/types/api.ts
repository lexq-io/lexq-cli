export interface ApiResponse<T = unknown> {
    result: 'SUCCESS' | 'ERROR';
    data: T;
    errorCode: string | null;
    message: string | null;
}

export interface PageResponse<T> {
    content: T[];
    pageNo: number;
    pageSize: number;
    totalElements: number;
    totalPages: number;
    last: boolean;
}