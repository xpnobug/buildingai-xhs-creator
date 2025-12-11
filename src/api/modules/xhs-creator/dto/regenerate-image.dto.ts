import { IsInt, IsNotEmpty, IsString, IsUUID } from "class-validator";

export class RegenerateImageDto {
    @IsUUID()
    @IsNotEmpty()
    taskId: string;

    @IsInt()
    @IsNotEmpty()
    pageIndex: number;

    @IsString()
    @IsNotEmpty()
    prompt: string;
}
