from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum as SqlEnum,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, enum.Enum):
    """사용자 권한 역할."""

    PATIENT = "patient"
    GUARDIAN = "guardian"
    ADMIN = "admin"


class LinkStatus(str, enum.Enum):
    """보호자·대상자 연결 상태."""

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class User(Base):
    """로그인 계정과 사용자 정보를 저장하는 테이블."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    name: Mapped[str] = mapped_column(
        String(100),
        index=True,
        nullable=False,
    )

    role: Mapped[UserRole] = mapped_column(
        SqlEnum(
            UserRole,
            values_callable=lambda enum_class: [
                item.value for item in enum_class
            ],
            native_enum=False,
            length=20,
        ),
        default=UserRole.PATIENT,
        server_default=UserRole.PATIENT.value,
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        server_default="true",
        nullable=False,
    )

    # 대상자에게만 발급되는 보호자 연결 코드
    patient_code: Mapped[str | None] = mapped_column(
        String(20),
        unique=True,
        index=True,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # 이 사용자를 대상으로 하는 건강 기록
    health_records: Mapped[list["HealthRecord"]] = relationship(
        back_populates="user",
        foreign_keys="HealthRecord.user_id",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    # 이 사용자가 작성한 건강 기록
    created_health_records: Mapped[list["HealthRecord"]] = relationship(
        back_populates="created_by",
        foreign_keys="HealthRecord.created_by_user_id",
    )

    # 보호자로 연결된 관계
    guardian_links: Mapped[list["GuardianPatientLink"]] = relationship(
        back_populates="guardian",
        foreign_keys="GuardianPatientLink.guardian_id",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    # 대상자로 연결된 관계
    patient_links: Mapped[list["GuardianPatientLink"]] = relationship(
        back_populates="patient",
        foreign_keys="GuardianPatientLink.patient_id",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class GuardianPatientLink(Base):
    """보호자와 건강 관리 대상자의 연결 관계."""

    __tablename__ = "guardian_patient_links"

    __table_args__ = (
        UniqueConstraint(
            "guardian_id",
            "patient_id",
            name="uq_guardian_patient_link",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    guardian_id: Mapped[int] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        index=True,
        nullable=False,
    )

    patient_id: Mapped[int] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        index=True,
        nullable=False,
    )

    # 가족, 부모, 배우자, 간병인 등
    relation_type: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    status: Mapped[LinkStatus] = mapped_column(
        SqlEnum(
            LinkStatus,
            values_callable=lambda enum_class: [
                item.value for item in enum_class
            ],
            native_enum=False,
            length=20,
        ),
        default=LinkStatus.PENDING,
        server_default=LinkStatus.PENDING.value,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    guardian: Mapped["User"] = relationship(
        back_populates="guardian_links",
        foreign_keys=[guardian_id],
    )

    patient: Mapped["User"] = relationship(
        back_populates="patient_links",
        foreign_keys=[patient_id],
    )


class HealthRecord(Base):
    """사용자의 건강 측정 기록."""

    __tablename__ = "health_records"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    # 실제 건강 기록의 대상자
    user_id: Mapped[int] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        index=True,
        nullable=False,
    )

    # 기록을 입력한 사용자
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="SET NULL",
        ),
        index=True,
        nullable=True,
    )

    date: Mapped[date] = mapped_column(
        Date,
        index=True,
        nullable=False,
    )

    weight: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    height: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    systolic: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    diastolic: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    blood_sugar: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    steps: Mapped[int] = mapped_column(
        Integer,
        default=0,
        server_default="0",
        nullable=False,
    )

    step_grade: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    sleep_hours: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    memo: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    bmi: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    bmi_category: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    bp_category: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    sugar_category: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    warnings: Mapped[list[str]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship(
        back_populates="health_records",
        foreign_keys=[user_id],
    )

    created_by: Mapped["User | None"] = relationship(
        back_populates="created_health_records",
        foreign_keys=[created_by_user_id],
    )