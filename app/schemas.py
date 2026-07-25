from datetime import date as DateType, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models import LinkStatus, UserRole

# ─────────────────────────────────────────
# 사용자 스키마
# ─────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr

    password: str = Field(
        min_length=8,
        max_length=128,
        description="8자 이상 128자 이하 비밀번호",
    )

    name: str = Field(
        min_length=1,
        max_length=100,
    )

    role: UserRole = UserRole.PATIENT


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    name: str
    role: UserRole
    is_active: bool
    patient_code: str | None = None
    created_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )

class PatientSummaryResponse(BaseModel):
    id: int
    email: EmailStr
    name: str
    role: UserRole

    model_config = ConfigDict(
        from_attributes=True,
    )

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

# ─────────────────────────────────────────
# 건강 기록 공통 입력 스키마
# ─────────────────────────────────────────
class HealthRecordBase(BaseModel):
    date: DateType

    weight: float = Field(
        ge=20,
        le=300,
        description="체중(kg), 허용 범위 20~300",
    )
    height: float = Field(
        ge=50,
        le=250,
        description="키(cm), 허용 범위 50~250",
    )
    systolic: int = Field(
        ge=60,
        le=250,
        description="수축기 혈압, 허용 범위 60~250",
    )
    diastolic: int = Field(
        ge=30,
        le=150,
        description="이완기 혈압, 허용 범위 30~150",
    )
    blood_sugar: int = Field(
        ge=40,
        le=500,
        description="혈당, 허용 범위 40~500",
    )
    steps: int = Field(
        ge=0,
        le=100000,
        description="걸음 수, 허용 범위 0~100000",
    )
    sleep_hours: float = Field(
        ge=0,
        le=24,
        description="수면 시간, 허용 범위 0~24",
    )
    memo: str | None = Field(
        default=None,
        max_length=500,
    )

    @field_validator("date")
    @classmethod
    def validate_record_date(
        cls,
        value: DateType,
    ) -> DateType:
        """미래 날짜의 건강 기록 생성을 막는다."""

        if value > DateType.today():
            raise ValueError(
                "기록 날짜는 오늘 이후일 수 없습니다."
            )

        return value

    @model_validator(mode="after")
    def validate_blood_pressure(self):
        """수축기 혈압이 이완기 혈압보다 높아야 한다."""

        if self.systolic <= self.diastolic:
            raise ValueError(
                "수축기 혈압은 이완기 혈압보다 높아야 합니다."
            )

        return self


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
    created_by_user_id: int | None = None

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

class GuardianLinkCreate(BaseModel):
    patient_code: str = Field(
        min_length=1,
        max_length=20,
        description="대상자에게 발급된 연결 코드",
    )

    relation_type: str | None = Field(
        default=None,
        max_length=50,
        description="부모, 자녀, 배우자, 간병인 등",
    )


class GuardianLinkStatusUpdate(BaseModel):
    status: LinkStatus


class GuardianLinkResponse(BaseModel):
    id: int
    guardian_id: int
    patient_id: int
    relation_type: str | None = None
    status: LinkStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )