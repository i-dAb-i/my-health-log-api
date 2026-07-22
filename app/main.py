from datetime import date as DateType
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.database import Base, SessionLocal, engine, get_db


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
    "/users",
    response_model=schemas.UserResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Users"],
)
def create_user(
    user_data: schemas.UserCreate,
    db: DbSession,
) -> models.User:
    """새로운 사용자를 생성한다."""

    if not user_data.name.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="사용자 이름은 공백일 수 없습니다.",
        )

    return crud.create_user(
        db=db,
        user_data=user_data,
    )


@app.get(
    "/users",
    response_model=list[schemas.UserResponse],
    tags=["Users"],
)
def read_users(
    db: DbSession,
) -> list[models.User]:
    """등록된 전체 사용자를 조회한다."""

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
def create_record(
    record_data: schemas.HealthRecordCreate,
    db: DbSession,
) -> models.HealthRecord:
    """
    건강 기록을 분석한 뒤 PostgreSQL에 저장한다.
    """

    user = crud.get_user(
        db=db,
        user_id=record_data.user_id,
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 사용자를 찾을 수 없습니다.",
        )

    return crud.create_health_record(
        db=db,
        record_data=record_data,
    )


@app.get(
    "/records",
    response_model=schemas.HealthRecordListResponse,
    tags=["Health Records"],
)
def read_records(
    db: DbSession,
    user_id: Annotated[
        int | None,
        Query(
            gt=0,
            description="특정 사용자의 기록만 조회할 때 입력",
        ),
    ] = None,
) -> schemas.HealthRecordListResponse:
    """
    전체 건강 기록 또는 특정 사용자의 기록을 조회한다.
    """

    if user_id is not None:
        user = crud.get_user(
            db=db,
            user_id=user_id,
        )

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="해당 사용자를 찾을 수 없습니다.",
            )

    records = crud.get_health_records(
        db=db,
        user_id=user_id,
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
def read_record(
    record_id: int,
    db: DbSession,
) -> models.HealthRecord:
    """건강 기록 한 건을 조회한다."""

    health_record = crud.get_health_record(
        db=db,
        record_id=record_id,
    )

    if health_record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 건강 기록을 찾을 수 없습니다.",
        )

    return health_record


@app.put(
    "/records/{record_id}",
    response_model=schemas.HealthRecordResponse,
    tags=["Health Records"],
)
def update_record(
    record_id: int,
    record_data: schemas.HealthRecordUpdate,
    db: DbSession,
) -> models.HealthRecord:
    """
    건강 기록을 수정하고,
    BMI·분류·경고·걸음 수 등급을 다시 계산한다.
    """

    health_record = crud.get_health_record(
        db=db,
        record_id=record_id,
    )

    if health_record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 건강 기록을 찾을 수 없습니다.",
        )

    user = crud.get_user(
        db=db,
        user_id=record_data.user_id,
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 사용자를 찾을 수 없습니다.",
        )

    return crud.update_health_record(
        db=db,
        health_record=health_record,
        record_data=record_data,
    )


@app.delete(
    "/records/{record_id}",
    response_model=schemas.DeleteResponse,
    tags=["Health Records"],
)
def delete_record(
    record_id: int,
    db: DbSession,
) -> schemas.DeleteResponse:
    """건강 기록 한 건을 삭제한다."""

    health_record = crud.get_health_record(
        db=db,
        record_id=record_id,
    )

    if health_record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 건강 기록을 찾을 수 없습니다.",
        )

    deleted_id = crud.delete_health_record(
        db=db,
        health_record=health_record,
    )

    return schemas.DeleteResponse(
        message="건강 기록이 삭제되었습니다.",
        deleted_id=deleted_id,
    )

@app.get(
    "/search",
    response_model=schemas.HealthRecordListResponse,
    tags=["Search and Statistics"],
)
def search_records(
    start: Annotated[
        DateType,
        Query(
            description="검색 시작일",
            examples=["2026-07-01"],
        ),
    ],
    end: Annotated[
        DateType,
        Query(
            description="검색 종료일",
            examples=["2026-07-31"],
        ),
    ],
    db: DbSession,
    user_id: Annotated[
        int | None,
        Query(
            gt=0,
            description="특정 사용자의 기록만 검색할 때 입력",
        ),
    ] = None,
) -> schemas.HealthRecordListResponse:
    """시작일부터 종료일까지의 건강 기록을 검색한다."""

    if start > end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="시작일은 종료일보다 늦을 수 없습니다.",
        )

    if user_id is not None:
        user = crud.get_user(
            db=db,
            user_id=user_id,
        )

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="해당 사용자를 찾을 수 없습니다.",
            )

    records = crud.search_health_records(
        db=db,
        start_date=start,
        end_date=end,
        user_id=user_id,
    )

    return schemas.HealthRecordListResponse(
        count=len(records),
        records=records,
    )

@app.get(
    "/stats",
    response_model=schemas.StatsResponse,
    tags=["Search and Statistics"],
)
def read_stats(
    db: DbSession,
    user_id: Annotated[
        int | None,
        Query(
            gt=0,
            description="특정 사용자의 통계만 조회할 때 입력",
        ),
    ] = None,
) -> schemas.StatsResponse:
    """전체 또는 특정 사용자의 건강 통계를 반환한다."""

    if user_id is not None:
        user = crud.get_user(
            db=db,
            user_id=user_id,
        )

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="해당 사용자를 찾을 수 없습니다.",
            )

    stats_data = crud.get_health_stats(
        db=db,
        user_id=user_id,
    )

    return schemas.StatsResponse(
        user_id=user_id,
        **stats_data,
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
            description="주간 리포트를 조회할 사용자 ID",
        ),
    ],
    db: DbSession,
    end: Annotated[
        DateType | None,
        Query(
            description=(
                "최근 7일의 마지막 날짜. "
                "입력하지 않으면 오늘을 사용합니다."
            ),
            examples=["2026-07-22"],
        ),
    ] = None,
) -> schemas.WeeklyReportResponse:
    """최근 7일과 직전 7일의 건강 평균을 비교한다."""

    user = crud.get_user(
        db=db,
        user_id=user_id,
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 사용자를 찾을 수 없습니다.",
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