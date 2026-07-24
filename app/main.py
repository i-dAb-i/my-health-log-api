from datetime import date as DateType
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.database import Base, SessionLocal, engine, get_db
from fastapi.security import OAuth2PasswordRequestForm

from app.security import create_access_token, get_current_user

# models.py에 정의된 테이블이 없으면 생성한다.
Base.metadata.create_all(bind=engine)


app = FastAPI(
    title="마이 헬스 로그 API",
    description=(
        "사용자별 건강 기록을 PostgreSQL에 저장하고 "
        "BMI, 혈압, 혈당, 걸음 수를 분석하는 API"
    ),
    version="1.0.0",
)


# 요청마다 하나의 DB 세션을 사용한다.
DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[
    models.User,
    Depends(get_current_user),
]
def resolve_record_scope(
    db: Session,
    current_user: models.User,
    requested_user_id: int | None = None,
) -> list[int] | None:
    """
    현재 사용자가 접근할 수 있는 건강 기록 대상자 ID를 반환한다.

    None은 관리자 전체 조회를 의미한다.
    """

    if requested_user_id is not None:
        target_user = crud.get_user(
            db=db,
            user_id=requested_user_id,
        )

        if target_user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="대상 사용자를 찾을 수 없습니다.",
            )

        if target_user.role != models.UserRole.PATIENT:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="건강 기록 대상자는 patient 역할이어야 합니다.",
            )

    if current_user.role == models.UserRole.ADMIN:
        if requested_user_id is None:
            return None

        return [requested_user_id]

    if current_user.role == models.UserRole.PATIENT:
        if (
            requested_user_id is not None
            and requested_user_id != current_user.id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="본인의 건강 기록만 접근할 수 있습니다.",
            )

        return [current_user.id]

    approved_patient_ids = crud.get_approved_patient_ids(
        db=db,
        guardian_id=current_user.id,
    )

    if requested_user_id is not None:
        if requested_user_id not in approved_patient_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="승인된 대상자의 기록만 접근할 수 있습니다.",
            )

        return [requested_user_id]

    return approved_patient_ids

# ─────────────────────────────────────────
# 기본 상태 확인
# ─────────────────────────────────────────

@app.get("/")
def read_root() -> dict[str, str]:
    return {
        "message": "마이 헬스 로그 API",
        "docs": "/docs",
    }


@app.get("/health")
def health_check() -> dict[str, str]:
    db = SessionLocal()

    try:
        db.execute(text("SELECT 1"))

        return {
            "status": "ok",
            "database": "connected",
        }

    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="데이터베이스 연결에 실패했습니다.",
        ) from exc

    finally:
        db.close()


# ─────────────────────────────────────────
# 사용자 API
# ─────────────────────────────────────────

@app.post(
    "/auth/register",
    response_model=schemas.UserResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Auth"],
)
def register_user(
    user_data: schemas.UserCreate,
    db: DbSession,
) -> schemas.UserResponse:
    """대상자 또는 보호자 계정을 생성한다."""

    if user_data.role == models.UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="관리자 계정은 일반 회원가입으로 만들 수 없습니다.",
        )

    existing_user = crud.get_user_by_email(
        db=db,
        email=str(user_data.email),
    )

    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 가입된 이메일입니다.",
        )

    return crud.create_user(
        db=db,
        user_data=user_data,
    )

@app.post(
    "/auth/login",
    response_model=schemas.TokenResponse,
    tags=["Auth"],
)
def login(
    form_data: Annotated[
        OAuth2PasswordRequestForm,
        Depends(),
    ],
    db: DbSession,
) -> schemas.TokenResponse:
    """
    이메일과 비밀번호를 확인하고 JWT를 발급한다.

    Swagger의 username 입력란에는 이메일을 입력한다.
    """

    user = crud.authenticate_user(
        db=db,
        email=form_data.username,
        password=form_data.password,
    )

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        subject=str(user.id),
    )

    return schemas.TokenResponse(
        access_token=access_token,
        token_type="bearer",
    )

@app.get(
    "/users/me",
    response_model=schemas.UserResponse,
    tags=["Users"],
)
def read_current_user(
    current_user: CurrentUser,
) -> schemas.UserResponse:
    """현재 로그인한 사용자 정보를 반환한다."""

    return current_user

@app.get(
    "/users/accessible-patients",
    response_model=list[schemas.PatientSummaryResponse],
    tags=["Users"],
)
def read_accessible_patients(
    current_user: CurrentUser,
    db: DbSession,
) -> list[schemas.PatientSummaryResponse]:
    """현재 사용자가 접근할 수 있는 대상자 목록을 반환한다."""

    return crud.get_accessible_patients(
        db=db,
        user=current_user,
    )


@app.get(
    "/users",
    response_model=list[schemas.UserResponse],
    tags=["Users"],
)
def read_users(
    current_user: CurrentUser,
    db: DbSession,
) -> list[schemas.UserResponse]:
    """관리자가 전체 사용자 목록을 조회한다."""

    if current_user.role != models.UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자만 전체 사용자를 조회할 수 있습니다.",
        )

    return crud.get_users(db=db)


# ─────────────────────────────────────────
# 건강 기록 API
# ─────────────────────────────────────────

@app.post(
    "/records",
    response_model=schemas.HealthRecordResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Health Records"],
)
def create_health_record(
    record_data: schemas.HealthRecordCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> schemas.HealthRecordResponse:
    """권한이 있는 대상자의 건강 기록을 생성한다."""

    resolve_record_scope(
        db=db,
        current_user=current_user,
        requested_user_id=record_data.user_id,
    )

    return crud.create_health_record(
        db=db,
        record_data=record_data,
        created_by_user_id=current_user.id,
    )


@app.get(
    "/records",
    response_model=schemas.HealthRecordListResponse,
    tags=["Health Records"],
)
def read_health_records(
    current_user: CurrentUser,
    db: DbSession,
    user_id: Annotated[
        int | None,
        Query(
            gt=0,
            description="조회할 대상자 ID",
        ),
    ] = None,
) -> schemas.HealthRecordListResponse:
    """역할에 따라 접근 가능한 건강 기록을 조회한다."""

    user_ids = resolve_record_scope(
        db=db,
        current_user=current_user,
        requested_user_id=user_id,
    )

    records = crud.get_health_records(
        db=db,
        user_ids=user_ids,
    )

    return schemas.HealthRecordListResponse(
        count=len(records),
        records=records,
    )

@app.get(
    "/records/{record_id}",
    response_model=schemas.HealthRecordResponse,
    tags=["Health Records"],
)
def read_health_record(
    record_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> schemas.HealthRecordResponse:
    """권한이 있는 건강 기록 한 건을 조회한다."""

    record = crud.get_health_record(
        db=db,
        record_id=record_id,
    )

    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="건강 기록을 찾을 수 없습니다.",
        )

    resolve_record_scope(
        db=db,
        current_user=current_user,
        requested_user_id=record.user_id,
    )

    return record


@app.put(
    "/records/{record_id}",
    response_model=schemas.HealthRecordResponse,
    tags=["Health Records"],
)
def update_health_record(
    record_id: int,
    record_data: schemas.HealthRecordUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> schemas.HealthRecordResponse:
    """권한이 있는 건강 기록을 수정하고 다시 분석한다."""

    record = crud.get_health_record(
        db=db,
        record_id=record_id,
    )

    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="건강 기록을 찾을 수 없습니다.",
        )

    resolve_record_scope(
        db=db,
        current_user=current_user,
        requested_user_id=record.user_id,
    )

    if record_data.user_id != record.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="기록의 대상 사용자는 변경할 수 없습니다.",
        )

    return crud.update_health_record(
        db=db,
        record=record,
        record_data=record_data,
    )


@app.delete(
    "/records/{record_id}",
    response_model=schemas.DeleteResponse,
    tags=["Health Records"],
)
def delete_health_record(
    record_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> schemas.DeleteResponse:
    """권한이 있는 건강 기록을 삭제한다."""

    record = crud.get_health_record(
        db=db,
        record_id=record_id,
    )

    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="건강 기록을 찾을 수 없습니다.",
        )

    resolve_record_scope(
        db=db,
        current_user=current_user,
        requested_user_id=record.user_id,
    )

    crud.delete_health_record(
        db=db,
        record=record,
    )

    return schemas.DeleteResponse(
        message="건강 기록이 삭제되었습니다.",
        deleted_id=record_id,
    )

@app.get(
    "/search",
    response_model=schemas.HealthRecordListResponse,
    tags=["Search"],
)
def search_health_records(
    start: Annotated[DateType, Query()],
    end: Annotated[DateType, Query()],
    current_user: CurrentUser,
    db: DbSession,
    user_id: Annotated[int | None, Query(gt=0)] = None,
) -> schemas.HealthRecordListResponse:
    """권한 범위 안에서 날짜별 건강 기록을 검색한다."""

    if start > end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="시작일은 종료일보다 늦을 수 없습니다.",
        )

    user_ids = resolve_record_scope(
        db=db,
        current_user=current_user,
        requested_user_id=user_id,
    )

    records = crud.search_health_records(
        db=db,
        start_date=start,
        end_date=end,
        user_ids=user_ids,
    )

    return schemas.HealthRecordListResponse(
        count=len(records),
        records=records,
    )

@app.get(
    "/weekly-report",
    response_model=schemas.WeeklyReportResponse,
    tags=["Reports"],
)
def read_weekly_report(
    user_id: Annotated[
        int,
        Query(
            gt=0,
            description="주간 리포트를 조회할 대상자 ID",
        ),
    ],
    current_user: CurrentUser,
    db: DbSession,
    end: Annotated[
        DateType | None,
        Query(
            description=(
                "최근 7일의 마지막 날짜. "
                "입력하지 않으면 오늘 날짜를 사용합니다."
            ),
        ),
    ] = None,
) -> schemas.WeeklyReportResponse:
    """권한이 있는 대상자의 최근 7일과 직전 7일을 비교한다."""

    resolve_record_scope(
        db=db,
        current_user=current_user,
        requested_user_id=user_id,
    )

    report_end_date = end or DateType.today()

    report_data = crud.get_weekly_report(
        db=db,
        user_id=user_id,
        end_date=report_end_date,
    )

    return schemas.WeeklyReportResponse(
        user_id=user_id,
        **report_data,
    )


@app.post(
    "/guardian-links",
    response_model=schemas.GuardianLinkResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Guardian Links"],
)
def create_guardian_link(
    link_data: schemas.GuardianLinkCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> schemas.GuardianLinkResponse:
    """보호자가 대상자 연결을 요청한다."""

    if current_user.role != models.UserRole.GUARDIAN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="보호자 계정만 연결을 요청할 수 있습니다.",
        )

    patient = crud.get_user_by_patient_code(
        db=db,
        patient_code=link_data.patient_code,
    )

    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="연결 코드에 해당하는 대상자가 없습니다.",
        )

    if patient.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="자기 자신과 연결할 수 없습니다.",
        )

    existing_link = crud.get_guardian_link_by_pair(
        db=db,
        guardian_id=current_user.id,
        patient_id=patient.id,
    )

    if existing_link is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 생성된 연결 관계가 있습니다.",
        )

    return crud.create_guardian_link(
        db=db,
        guardian_id=current_user.id,
        patient_id=patient.id,
        relation_type=link_data.relation_type,
    )

@app.get(
    "/stats",
    response_model=schemas.StatsResponse,
    tags=["Statistics"],
)
def read_stats(
    current_user: CurrentUser,
    db: DbSession,
    user_id: Annotated[
        int | None,
        Query(
            gt=0,
            description="통계를 조회할 대상자 ID",
        ),
    ] = None,
) -> schemas.StatsResponse:
    """접근 가능한 건강 기록의 평균 통계를 반환한다."""

    user_ids = resolve_record_scope(
        db=db,
        current_user=current_user,
        requested_user_id=user_id,
    )

    return schemas.StatsResponse(
        **crud.get_health_stats(
            db=db,
            user_ids=user_ids,
        )
    )

@app.get(
    "/guardian-links",
    response_model=list[schemas.GuardianLinkResponse],
    tags=["Guardian Links"],
)
def read_guardian_links(
    current_user: CurrentUser,
    db: DbSession,
) -> list[schemas.GuardianLinkResponse]:
    """현재 사용자가 볼 수 있는 보호자 연결 목록을 반환한다."""

    return crud.get_guardian_links_for_user(
        db=db,
        user=current_user,
    )

@app.patch(
    "/guardian-links/{link_id}/status",
    response_model=schemas.GuardianLinkResponse,
    tags=["Guardian Links"],
)
def update_guardian_link_status(
    link_id: int,
    status_data: schemas.GuardianLinkStatusUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> schemas.GuardianLinkResponse:
    """대상자 또는 관리자가 연결 요청을 승인하거나 거절한다."""

    link = crud.get_guardian_link(
        db=db,
        link_id=link_id,
    )

    if link is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="연결 요청을 찾을 수 없습니다.",
        )

    is_admin = current_user.role == models.UserRole.ADMIN
    is_target_patient = (
        current_user.role == models.UserRole.PATIENT
        and link.patient_id == current_user.id
    )

    if not is_admin and not is_target_patient:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="이 연결 요청의 상태를 변경할 권한이 없습니다.",
        )

    if status_data.status == models.LinkStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="연결 상태를 pending으로 되돌릴 수 없습니다.",
        )

    return crud.update_guardian_link_status(
        db=db,
        link=link,
        new_status=status_data.status,
    )