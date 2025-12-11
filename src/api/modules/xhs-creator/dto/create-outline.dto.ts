import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateOutlineDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    topic: string;

    @IsOptional()
    @IsString({ each: true })
    userImages?: string[]; // URLs of uploaded images
}
