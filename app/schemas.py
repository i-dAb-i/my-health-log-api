from datetime import date as DateType, datetime

from pydantic import BaseModel, ConfigDict, Field


# ─────────────────────────────────────────
# 사용자 스키마
# ─────────────────────────────────────────

class UserCreate(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=100,
        description="사용자 이름",
        examples=["은다빈"],
    )


class UserResponse(BaseModel):
    id: int
    name: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ─────────────────────────────────────────
# 건강 기록 공통 입력 스키마
# ─────────────────────────────────────────

class HealthRecordBase(BaseModel):
    date: DateType = Field(
        description="건강 측정일",
        examples=["2026-07-21"],
    )

    weight: float = Field(
        gt=0,
        description="몸무게(kg)",
        examples=[60.5],
    )

    height: float = Field(
        gt=0,
        description="키(cm)",
        examples=[165.0],
    )

    systolic: int = Field(
        gt=0,
        description="수축기 혈압",
        examples=[120],
    )

    diastolic: int = Field(
        gt=0,
        description="이완기 혈압",
        examples=[80],
    )

    blood_sugar: int = Field(
        gt=0,
        description="공복 혈당(mg/dL)",
        examples=[95],
    )

    steps: int = Field(
        default=0,
        ge=0,
        description="하루 걸음 수",
        examples=[8000],
    )

    sleep_hours: float = Field(
        default=0.0,
        ge=0,
        le=24,
        description="수면 시간",
        examples=[7.5],
    )

    memo: str = Field(
        default="",
        max_length=500,
        description="건강 기록 메모",
        examples=["아침 식사 전에 측정"],
    )


# 건강 기록 생성 요청
class HealthRecordCreate(HealthRecordBase):
    user_id: int = Field(
        gt=0,
        description="기록 소유자의 사용자 ID",
        examples=[1],
    )


# PUT 수정 요청
class HealthRecordUpdate(HealthRecordBase):
    user_id: int = Field(
        gt=0,
        description="기록 소유자의 사용자 ID",
        examples=[1],
    )


# 건강 기록 응답
class HealthRecordResponse(HealthRecordBase):
    id: int
    user_id: int

    bmi: float
    bmi_category: str
    bp_category: str
    sugar_category: str

    step_grade: str
    warnings: list[str]

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# 전체 기록 조회 응답
class HealthRecordListResponse(BaseModel):
    count: int
    records: list[HealthRecordResponse]


# 삭제 응답
class DeleteResponse(BaseModel):
    message: str
    deleted_id: int


class StatsResponse(BaseModel):
    user_id: int | None = None
    record_count: int

    average_weight: float | None = None
    average_bmi: float | None = None
    average_systolic: float | None = None
    average_diastolic: float | None = None
    average_blood_sugar: float | None = None
    average_steps: float | None = None
    average_sleep_hours: float | None = None

class WeeklyAverageResponse(BaseModel):
    start_date: DateType
    end_date: DateType
    record_count: int

    average_weight: float | None = None
    average_bmi: float | None = None
    average_steps: float | None = None
    average_sleep_hours: float | None = None


class WeeklyChangeResponse(BaseModel):
    weight: float | None = None
    bmi: float | None = None
    steps: float | None = None
    sleep_hours: float | None = None


class WeeklyReportResponse(BaseModel):
    user_id: int
    current_week: WeeklyAverageResponse
    previous_week: WeeklyAverageResponse
    changes: WeeklyChangeResponse