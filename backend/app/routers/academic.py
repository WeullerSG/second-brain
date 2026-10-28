from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AcademicTask
from app.schemas import AcademicTaskCreate, AcademicTaskOut, AcademicTaskUpdate

router = APIRouter(prefix="/api/academic", tags=["Faculdade & Estudos"])


@router.get("", response_model=list[AcademicTaskOut])
def list_academic_tasks(
    status: Optional[str] = None,
    subject: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(AcademicTask)
    if status:
        q = q.filter(AcademicTask.status == status)
    if subject:
        q = q.filter(AcademicTask.subject.ilike(f"%{subject}%"))
    return q.order_by(AcademicTask.due_date.asc(), AcademicTask.created_at.desc()).all()


@router.post("", response_model=AcademicTaskOut)
def create_academic_task(payload: AcademicTaskCreate, db: Session = Depends(get_db)):
    task = AcademicTask(**payload.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.put("/{task_id}", response_model=AcademicTaskOut)
def update_academic_task(
    task_id: int,
    payload: AcademicTaskUpdate,
    db: Session = Depends(get_db),
):
    task = db.query(AcademicTask).filter(AcademicTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Atividade acadêmica não encontrada")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}")
def delete_academic_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(AcademicTask).filter(AcademicTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Atividade acadêmica não encontrada")
    db.delete(task)
    db.commit()
    return {"status": "deleted", "id": task_id}
