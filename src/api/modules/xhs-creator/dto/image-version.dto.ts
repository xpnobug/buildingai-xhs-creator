import { IsInt, IsNotEmpty, IsUUID, Min } from "class-validator";

export class GetImageVersionsDto {
    @IsUUID()
    @IsNotEmpty()
    taskId: string;

    @IsInt()
    @Min(0)
    @IsNotEmpty()
    pageIndex: number;
}

export class RestoreImageVersionDto {
    @IsUUID()
    @IsNotEmpty()
    taskId: string;

    @IsInt()
    @Min(0)
    @IsNotEmpty()
    pageIndex: number;

    @IsInt()
    @Min(1)
    @IsNotEmpty()
    version: number;
}
